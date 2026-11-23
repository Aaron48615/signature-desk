#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include "input.h"
#include <commctrl.h>
#include <hidsdi.h>
#include <hidpi.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum {
  DIGITIZER = 0x0d,
  TOUCHPAD = 5,
  TIP = 0x42,
  CONTACT_ID = 0x51,
  CONTACT_COUNT = 0x54,
  MAX_FINGERS = 64
};
typedef struct {
  USHORT link;
  HIDP_VALUE_CAPS x, y;
} Finger;
typedef struct {
  PHIDP_PREPARSED_DATA data;
  Finger fingers[MAX_FINGERS];
  int n;
  double ratio;
  USHORT count_link;
} Descriptor;
static struct {
  HWND window;
  HANDLE device;
  Descriptor hid;
  POINT pointer;
  RECT clip;
  FrameSink sink;
  uint32_t session;
  int expected, seen, active;
  DWORD previous_packet_time;
  double x, y;
} capture;
static int has_usage(HIDP_VALUE_CAPS *v, USAGE usage) {
  return v->IsRange ? usage >= v->Range.UsageMin && usage <= v->Range.UsageMax
                    : v->NotRange.Usage == usage;
}
static double physical(HIDP_VALUE_CAPS *v) {
  int exp = (int)(v->UnitsExp & 15);
  if (exp >= 8)
    exp -= 16;
  return (v->PhysicalMax - (double)v->PhysicalMin) * pow(10, exp);
}
static int descriptor(HANDLE dev, Descriptor *out) {
  memset(out, 0, sizeof *out);
  UINT len = 0;
  if (GetRawInputDeviceInfoW(dev, RIDI_PREPARSEDDATA, NULL, &len) == (UINT)-1 ||
      !len)
    return 0;
  out->data = (PHIDP_PREPARSED_DATA)malloc(len);
  if (!out->data)
    return 0;
  HIDP_CAPS caps;
  if (GetRawInputDeviceInfoW(dev, RIDI_PREPARSEDDATA, out->data, &len) ==
          (UINT)-1 ||
      HidP_GetCaps(out->data, &caps) != HIDP_STATUS_SUCCESS ||
      caps.UsagePage != DIGITIZER || caps.Usage != TOUCHPAD)
    goto fail;
  USHORT n = caps.NumberInputValueCaps;
  HIDP_VALUE_CAPS *values = (HIDP_VALUE_CAPS *)calloc(n, sizeof *values);
  if (!values)
    goto fail;
  if (HidP_GetValueCaps(HidP_Input, values, &n, out->data) !=
      HIDP_STATUS_SUCCESS) {
    free(values);
    goto fail;
  }
  for (USHORT i = 0; i < n; i++) {
    HIDP_VALUE_CAPS v = values[i];
    if (v.UsagePage == DIGITIZER && has_usage(&v, CONTACT_COUNT))
      out->count_link = v.LinkCollection;
    if (v.UsagePage != DIGITIZER || !has_usage(&v, CONTACT_ID) ||
        out->n >= MAX_FINGERS)
      continue;
    Finger f = {0};
    f.link = v.LinkCollection;
    for (USHORT j = 0; j < n; j++) {
      HIDP_VALUE_CAPS a = values[j];
      if (a.UsagePage != 1 || a.LinkCollection != f.link ||
          a.ReportID != v.ReportID)
        continue;
      if (has_usage(&a, 0x30))
        f.x = a;
      if (has_usage(&a, 0x31))
        f.y = a;
    }
    if (f.x.LogicalMax <= f.x.LogicalMin || f.y.LogicalMax <= f.y.LogicalMin)
      continue;
    out->fingers[out->n++] = f;
    if (physical(&f.y) > 0 && physical(&f.x) > 0 && f.x.Units == f.y.Units)
      out->ratio = physical(&f.x) / physical(&f.y);
  }
  free(values);
  if (out->n)
    return 1;
fail:
  free(out->data);
  out->data = NULL;
  return 0;
}
void ink_devices(DeviceSink sink) {
  UINT count = 0;
  GetRawInputDeviceList(NULL, &count, sizeof(RAWINPUTDEVICELIST));
  RAWINPUTDEVICELIST *list = calloc(count, sizeof *list);
  if (!list)
    return;
  UINT got = GetRawInputDeviceList(list, &count, sizeof *list);
  int index = 0;
  if (got != (UINT)-1)
    for (UINT i = 0; i < got; i++) {
      if (list[i].dwType != RIM_TYPEHID)
        continue;
      Descriptor d;
      if (!descriptor(list[i].hDevice, &d))
        continue;
      char id[40], label[80];
      snprintf(id, sizeof id, "%llx",
               (unsigned long long)(uintptr_t)list[i].hDevice);
      snprintf(label, sizeof label, "Precision Touchpad %d", ++index);
      sink(id, label, d.ratio, 0);
      free(d.data);
    }
  free(list);
}
static int value(USAGE page, USHORT link, USAGE usage, CHAR *report, ULONG size,
                 ULONG *out) {
  return HidP_GetUsageValue(HidP_Input, page, link, usage, out,
                            capture.hid.data, report,
                            size) == HIDP_STATUS_SUCCESS;
}
static void decode(CHAR *report, ULONG size, double time_ms) {
  Descriptor *d = &capture.hid;
  ULONG count = 0;
  int has_count =
      value(DIGITIZER, d->count_link, CONTACT_COUNT, report, size, &count);
  if (has_count && !count && !capture.expected) {
    capture.sink(capture.session, 0, 0, 0, d->ratio, time_ms);
    return;
  }
  if (has_count && count) {
    if (count > MAX_FINGERS) {
      capture.sink(capture.session, -2, 0, 0, 0, 0);
      return;
    }
    capture.expected = (int)count;
    capture.seen = capture.active = 0;
  }
  if (!capture.expected)
    return;
  for (int i = 0; i < d->n && capture.seen < capture.expected; i++) {
    Finger *f = &d->fingers[i];
    ULONG id, x, y;
    if (!value(DIGITIZER, f->link, CONTACT_ID, report, size, &id) ||
        !value(1, f->link, 0x30, report, size, &x) ||
        !value(1, f->link, 0x31, report, size, &y))
      continue;
    USAGE usages[64];
    ULONG num = 64;
    if (HidP_GetUsages(HidP_Input, DIGITIZER, f->link, usages, &num, d->data,
                       report, size) != HIDP_STATUS_SUCCESS)
      continue;
    capture.seen++;
    for (ULONG j = 0; j < num; j++)
      if (usages[j] == TIP) {
        capture.active++;
        capture.x = ((double)x - f->x.LogicalMin) /
                    (f->x.LogicalMax - (double)f->x.LogicalMin);
        capture.y = ((double)y - f->y.LogicalMin) /
                    (f->y.LogicalMax - (double)f->y.LogicalMin);
        break;
      }
  }
  if (capture.seen == capture.expected) {
    capture.expected = 0;
    capture.sink(capture.session, capture.active, capture.x, capture.y,
                 d->ratio, time_ms);
  }
}
static LRESULT CALLBACK messages(HWND w, UINT msg, WPARAM wp, LPARAM lp,
                                 UINT_PTR sid, DWORD_PTR ref) {
  (void)sid;
  (void)ref;
  if (msg == WM_INPUT) {
    UINT len = 0;
    if (GetRawInputData((HRAWINPUT)lp, RID_INPUT, NULL, &len,
                        sizeof(RAWINPUTHEADER)) == 0 &&
        len >= sizeof(RAWINPUTHEADER)) {
      RAWINPUT *raw = malloc(len);
      if (raw &&
          GetRawInputData((HRAWINPUT)lp, RID_INPUT, raw, &len,
                          sizeof(RAWINPUTHEADER)) == len &&
          raw->header.hDevice == capture.device &&
          raw->header.dwType == RIM_TYPEHID) {
        RAWHID *h = &raw->data.hid;
        DWORD now = (DWORD)GetMessageTime();
        DWORD gap = now - capture.previous_packet_time;
        // Multiple reports in one message share its timestamp. Spread them over
        // the delivery interval; cap the interval after an idle device.
        double interval = gap < 40 ? gap : 8;
        for (DWORD i = 0; i < h->dwCount; i++) {
          double time_ms = now - interval * (h->dwCount - i - 1) / h->dwCount;
          decode((CHAR *)h->bRawData + i * h->dwSizeHid, h->dwSizeHid, time_ms);
        }
        capture.previous_packet_time = now;
      }
      free(raw);
    }
  } else if ((msg == WM_INPUT_DEVICE_CHANGE && wp == GIDC_REMOVAL &&
              (HANDLE)lp == capture.device) ||
             (msg == WM_ACTIVATEAPP && !wp))
    capture.sink(capture.session, -2, 0, 0, 0, 0);
  return DefSubclassProc(w, msg, wp, lp);
}
int ink_start(void *handle, const char *id, double aspect, uint32_t session,
              FrameSink sink) {
  HWND w = (HWND)handle;
  if (capture.window || GetForegroundWindow() != w)
    return 1;
  capture.device = (HANDLE)(uintptr_t)strtoull(id, NULL, 16);
  if (!descriptor(capture.device, &capture.hid))
    return 3;
  if (capture.hid.ratio <= 0)
    capture.hid.ratio = aspect;
  if (capture.hid.ratio <= 0) {
    free(capture.hid.data);
    return 4;
  }
  capture.session = session;
  capture.sink = sink;
  if (!SetWindowSubclass(w, messages, 1, 0)) {
    free(capture.hid.data);
    return 1;
  }
  RAWINPUTDEVICE reg = {DIGITIZER, TOUCHPAD, RIDEV_DEVNOTIFY, w};
  if (!RegisterRawInputDevices(&reg, 1, sizeof reg)) {
    RemoveWindowSubclass(w, messages, 1);
    free(capture.hid.data);
    return 1;
  }
  capture.window = w;
  GetCursorPos(&capture.pointer);
  GetClipCursor(&capture.clip);
  RECT client;
  GetClientRect(w, &client);
  POINT center = {(client.right - client.left) / 2,
                  (client.bottom - client.top) / 2};
  ClientToScreen(w, &center);
  RECT pin = {center.x, center.y, center.x + 1, center.y + 1};
  if (!ClipCursor(&pin)) {
    ink_stop();
    return 1;
  }
  return 0;
}
void ink_stop(void) {
  if (!capture.window)
    return;
  RemoveWindowSubclass(capture.window, messages, 1);
  RAWINPUTDEVICE reg = {DIGITIZER, TOUCHPAD, RIDEV_REMOVE, NULL};
  RegisterRawInputDevices(&reg, 1, sizeof reg);
  ClipCursor(&capture.clip);
  SetCursorPos(capture.pointer.x, capture.pointer.y);
  free(capture.hid.data);
  memset(&capture, 0, sizeof capture);
}
