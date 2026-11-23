// Run only in an isolated Linux test VM with uinput access.
// Creates a synthetic touchpad and selects it by its unique name.
#include "../src-tauri/native/input.h"
#include <assert.h>
#include <fcntl.h>
#include <linux/uinput.h>
#include <math.h>
#include <stdatomic.h>
#include <stdio.h>
#include <string.h>
#include <unistd.h>
static int fd;
static char name[80], path[160];
static atomic_int length;
static struct {
  int count;
  double x, y;
} frames[32];
static void axis(int code, int max, int res) {
  struct uinput_abs_setup a = {.code = code,
                               .absinfo = {.maximum = max, .resolution = res}};
  assert(ioctl(fd, UI_SET_ABSBIT, code) == 0);
  assert(ioctl(fd, UI_ABS_SETUP, &a) == 0);
}
static void event(int type, int code, int value) {
  struct input_event e = {.type = type, .code = code, .value = value};
  assert(write(fd, &e, sizeof e) == sizeof e);
}
static void sync_frame(void) { event(EV_SYN, SYN_REPORT, 0); }
static void device(const char *id, const char *label, double ratio,
                   int status) {
  if (strcmp(name, label))
    return;
  assert(status == 0 && fabs(ratio - 2) < 0.001);
  snprintf(path, sizeof path, "%s", id);
}
static void receive(uint32_t session, int count, double x, double y,
                    double ratio, double time_ms) {
  if (count >= 0) assert(isfinite(time_ms) && time_ms > 0);
  int i = atomic_load(&length);
  assert(session == 17 && i < 32);
  if (count > 0)
    assert(fabs(ratio - 2) < 0.001);
  frames[i].count = count;
  frames[i].x = x;
  frames[i].y = y;
  atomic_store(&length, i + 1);
}
static void contact(int slot, int id, int x, int y) {
  event(EV_ABS, ABS_MT_SLOT, slot);
  event(EV_ABS, ABS_MT_TRACKING_ID, id);
  if (id >= 0) {
    event(EV_ABS, ABS_MT_POSITION_X, x);
    event(EV_ABS, ABS_MT_POSITION_Y, y);
  }
  sync_frame();
}
int main(void) {
  fd = open("/dev/uinput", O_WRONLY | O_CLOEXEC);
  if (fd < 0) {
    perror("uinput");
    return 1;
  }
  snprintf(name, sizeof name, "Signature Desk synthetic test %d", getpid());
  struct uinput_setup dev = {
      .id = {.bustype = BUS_USB, .vendor = 0x1209, .product = 0x0011}};
  snprintf(dev.name, sizeof dev.name, "%s", name);
  assert(ioctl(fd, UI_SET_EVBIT, EV_KEY) == 0);
  assert(ioctl(fd, UI_SET_EVBIT, EV_ABS) == 0);
  assert(ioctl(fd, UI_SET_PROPBIT, INPUT_PROP_POINTER) == 0);
  for (int i = 0; i < 3; i++)
    assert(ioctl(fd, UI_SET_KEYBIT,
                 ((int[]){BTN_TOOL_FINGER, BTN_TOUCH, BTN_LEFT})[i]) == 0);
  axis(ABS_X, 2000, 20);
  axis(ABS_Y, 1000, 20);
  axis(ABS_MT_SLOT, 1, 0);
  axis(ABS_MT_TRACKING_ID, 65535, 0);
  axis(ABS_MT_POSITION_X, 2000, 20);
  axis(ABS_MT_POSITION_Y, 1000, 20);
  assert(ioctl(fd, UI_DEV_SETUP, &dev) == 0);
  assert(ioctl(fd, UI_DEV_CREATE) == 0);
  for (int i = 0; i < 60 && !path[0]; i++) {
    usleep(50000);
    ink_devices(device);
  }
  assert(path[0] && ink_start(NULL, path, 0, 17, receive) == 0);
  contact(0, 1, 160, 100);
  contact(0, -1, 0, 0);
  contact(0, 2, 1560, 780);
  contact(1, 3, 400, 200);
  contact(1, -1, 0, 0);
  contact(0, -1, 0, 0);
  for (int i = 0; i < 60 && atomic_load(&length) < 6; i++)
    usleep(10000);
  assert(atomic_load(&length) == 6);
  assert(frames[0].count == 1 && fabs(frames[0].x - .08) < .001 &&
         fabs(frames[0].y - .1) < .001);
  assert(frames[1].count == 0 && frames[2].count == 1 &&
         fabs(frames[2].x - .78) < .001);
  assert(frames[3].count == 2 && frames[4].count == 1 && frames[5].count == 0);
  assert(ioctl(fd, UI_DEV_DESTROY) == 0);
  for (int i = 0; i < 60 && atomic_load(&length) < 7; i++)
    usleep(10000);
  ink_stop();
  close(fd);
  assert(atomic_load(&length) == 7 && frames[6].count < 0);
  puts("PASS synthetic evdev device: discovery, aspect, two positions, lift, "
       "two slots, disconnection");
}
