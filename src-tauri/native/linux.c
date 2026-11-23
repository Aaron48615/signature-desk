#include "input.h"
#include <errno.h>
#include <fcntl.h>
#include <libudev.h>
#include <linux/input.h>
#include <poll.h>
#include <pthread.h>
#include <stdatomic.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ioctl.h>
#include <sys/stat.h>
#include <unistd.h>

enum { MAX_SLOTS = 128 };
typedef struct {
  int id, x, y;
} Slot;
typedef struct {
  int fd, slot, count, mt, wait_lift;
  struct input_absinfo xaxis, yaxis;
  Slot slots[MAX_SLOTS];
  double aspect;
  FrameSink sink;
  uint32_t session;
} Reader;
static Reader reader;
static pthread_t worker;
static atomic_bool stopping;
static int started;
static double aspect_of(Reader *r) {
  if (r->xaxis.resolution <= 0 || r->yaxis.resolution <= 0)
    return 0;
  return ((double)(r->xaxis.maximum - r->xaxis.minimum) / r->xaxis.resolution) /
         ((double)(r->yaxis.maximum - r->yaxis.minimum) / r->yaxis.resolution);
}
static int axes(Reader *r) {
  struct input_absinfo slots;
  r->mt = ioctl(r->fd, EVIOCGABS(ABS_MT_SLOT), &slots) == 0;
  r->count = r->mt ? slots.maximum + 1 : 1;
  if (r->count <= 0 || r->count > MAX_SLOTS)
    return 0;
  r->slot = r->mt ? slots.value : 0;
  return ioctl(r->fd, EVIOCGABS(r->mt ? ABS_MT_POSITION_X : ABS_X),
               &r->xaxis) == 0 &&
         ioctl(r->fd, EVIOCGABS(r->mt ? ABS_MT_POSITION_Y : ABS_Y),
               &r->yaxis) == 0 &&
         r->xaxis.maximum > r->xaxis.minimum &&
         r->yaxis.maximum > r->yaxis.minimum;
}
static int touchpad(struct udev_device *d) {
  const char *p =
      d ? udev_device_get_property_value(d, "ID_INPUT_TOUCHPAD") : NULL;
  return p && strcmp(p, "1") == 0;
}
void ink_devices(DeviceSink sink) {
  struct udev *u = udev_new();
  if (!u)
    return;
  struct udev_enumerate *e = udev_enumerate_new(u);
  udev_enumerate_add_match_subsystem(e, "input");
  udev_enumerate_add_match_property(e, "ID_INPUT_TOUCHPAD", "1");
  udev_enumerate_scan_devices(e);
  struct udev_list_entry *entry;
  udev_list_entry_foreach(entry, udev_enumerate_get_list_entry(e)) {
    struct udev_device *d =
        udev_device_new_from_syspath(u, udev_list_entry_get_name(entry));
    const char *path = d ? udev_device_get_devnode(d) : NULL;
    if (path && !strncmp(path, "/dev/input/event", 16)) {
      Reader r = {0};
      r.fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
      char name[256] = "触控板";
      struct udev_device *parent = udev_device_get_parent(d);
      const char *label =
          parent ? udev_device_get_sysattr_value(parent, "name") : NULL;
      if (label)
        snprintf(name, sizeof name, "%s", label);
      int status = r.fd < 0 ? 2 : (axes(&r) ? 0 : 3);
      sink(path, name, status ? 0 : aspect_of(&r), status);
      if (r.fd >= 0)
        close(r.fd);
    }
    if (d)
      udev_device_unref(d);
  }
  udev_enumerate_unref(e);
  udev_unref(u);
}
static void emit_frame(Reader *r, double time_ms) {
  int count = 0;
  Slot point = {0};
  for (int i = 0; i < r->count; i++)
    if (r->slots[i].id >= 0) {
      count++;
      point = r->slots[i];
    }
  if (r->wait_lift) {
    if (count == 0) {
      r->wait_lift = 0;
      r->sink(r->session, 0, 0, 0, r->aspect, time_ms);
    }
    return;
  }
  r->sink(r->session, count,
          (double)(point.x - r->xaxis.minimum) /
              (r->xaxis.maximum - r->xaxis.minimum),
          (double)(point.y - r->yaxis.minimum) /
              (r->yaxis.maximum - r->yaxis.minimum),
          r->aspect, time_ms);
}
static void *read_events(void *arg) {
  Reader *r = arg;
  struct pollfd fd = {.fd = r->fd, .events = POLLIN};
  while (!atomic_load(&stopping)) {
    int ready = poll(&fd, 1, 40);
    if (ready < 0 && errno == EINTR)
      continue;
    if (ready < 0 || fd.revents & (POLLERR | POLLHUP | POLLNVAL))
      break;
    if (!ready)
      continue;
    struct input_event events[48];
    ssize_t n = read(r->fd, events, sizeof events);
    if (n < 0 && (errno == EINTR || errno == EAGAIN))
      continue;
    if (n <= 0)
      break;
    for (size_t i = 0; i < (size_t)n / sizeof events[0]; i++) {
      struct input_event v = events[i];
      if (v.type == EV_SYN && v.code == SYN_DROPPED)
        goto disconnected;
      if (v.type == EV_SYN && v.code == SYN_REPORT) {
        emit_frame(r, v.input_event_sec * 1000.0 + v.input_event_usec / 1000.0);
        continue;
      }
      if (v.type == EV_ABS && v.code == ABS_MT_SLOT) {
        r->slot = v.value;
        continue;
      }
      if (r->slot < 0 || r->slot >= r->count)
        continue;
      Slot *s = &r->slots[r->slot];
      if (r->mt && v.type == EV_ABS && v.code == ABS_MT_TRACKING_ID)
        s->id = v.value;
      if (!r->mt && v.type == EV_KEY && v.code == BTN_TOUCH)
        s->id = v.value ? 0 : -1;
      if (v.type == EV_ABS && v.code == (r->mt ? ABS_MT_POSITION_X : ABS_X))
        s->x = v.value;
      if (v.type == EV_ABS && v.code == (r->mt ? ABS_MT_POSITION_Y : ABS_Y))
        s->y = v.value;
      if (!r->mt && v.type == EV_KEY && v.code == BTN_TOOL_DOUBLETAP &&
          v.value) {
        r->wait_lift = 1;
        r->sink(r->session, 2, 0, 0, r->aspect, v.input_event_sec * 1000.0 + v.input_event_usec / 1000.0);
      }
    }
  }
disconnected:
  ioctl(r->fd, EVIOCGRAB, 0);
  if (!atomic_load(&stopping))
    r->sink(r->session, -2, 0, 0, 0, 0);
  return NULL;
}
int ink_start(void *window, const char *path, double aspect, uint32_t session,
              FrameSink sink) {
  (void)window;
  if (started || strncmp(path, "/dev/input/event", 16))
    return 1;
  Reader *r = &reader;
  memset(r, 0, sizeof *r);
  r->fd = open(path, O_RDONLY | O_NONBLOCK | O_CLOEXEC);
  if (r->fd < 0)
    return errno == EACCES ? 2 : 1;
  struct stat statbuf;
  struct udev *u = udev_new();
  struct udev_device *d =
      u && fstat(r->fd, &statbuf) == 0
          ? udev_device_new_from_devnum(u, 'c', statbuf.st_rdev)
          : NULL;
  int valid = touchpad(d);
  if (d)
    udev_device_unref(d);
  if (u)
    udev_unref(u);
  if (!valid || !axes(r)) {
    close(r->fd);
    return 3;
  }
  r->aspect = aspect_of(r);
  if (r->aspect <= 0)
    r->aspect = aspect;
  if (r->aspect <= 0) {
    close(r->fd);
    return 4;
  }
  if (ioctl(r->fd, EVIOCGRAB, 1) < 0) {
    close(r->fd);
    return 2;
  }
  for (int i = 0; i < r->count; i++)
    r->slots[i].id = -1;
  if (r->mt) {
    int values[MAX_SLOTS + 1] = {ABS_MT_TRACKING_ID};
    if (ioctl(r->fd, EVIOCGMTSLOTS((r->count + 1) * sizeof(int)), values) < 0) {
      close(r->fd);
      return 3;
    }
    for (int i = 0; i < r->count; i++) {
      r->slots[i].id = values[i + 1];
      if (values[i + 1] >= 0)
        r->wait_lift = 1;
    }
    // evdev may omit unchanged axes, including on the next contact.
    for (int axis = 0; axis < 2; axis++) {
      values[0] = axis ? ABS_MT_POSITION_Y : ABS_MT_POSITION_X;
      if (ioctl(r->fd, EVIOCGMTSLOTS((r->count + 1) * sizeof(int)), values) <
          0) {
        close(r->fd);
        return 3;
      }
      for (int i = 0; i < r->count; i++) {
        if (axis)
          r->slots[i].y = values[i + 1];
        else
          r->slots[i].x = values[i + 1];
      }
    }
  } else {
    unsigned char keys[KEY_MAX / 8 + 1] = {0};
    ioctl(r->fd, EVIOCGKEY(sizeof keys), keys);
    r->slots[0].x = r->xaxis.value;
    r->slots[0].y = r->yaxis.value;
    if (keys[BTN_TOUCH / 8] & (1 << (BTN_TOUCH % 8))) {
      r->slots[0].id = 0;
      r->wait_lift = 1;
    }
  }
  r->session = session;
  r->sink = sink;
  atomic_store(&stopping, 0);
  if (pthread_create(&worker, NULL, read_events, r)) {
    close(r->fd);
    return 1;
  }
  started = 1;
  return 0;
}
void ink_stop(void) {
  if (!started)
    return;
  atomic_store(&stopping, 1);
  pthread_join(worker, NULL);
  close(reader.fd);
  started = 0;
}
