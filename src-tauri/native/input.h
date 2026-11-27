#pragma once
#include <stdint.h>
// Device id, human-readable name, physical aspect (0 if unknown), status.
typedef void (*DeviceSink)(const char *, const char *, double, int);
enum { INK_UNDO = -3, INK_REDO = -4 };
// Session, number of contacts (-1 stop, -2 lost, or a history command), first contact x/y,
// aspect, event time in milliseconds (only differences within a contact matter).
typedef void (*FrameSink)(uint32_t, int, double, double, double, double);
void ink_devices(DeviceSink);
int ink_start(void *window, const char *device, double aspect, uint32_t session,
              FrameSink sink);
void ink_stop(void);
