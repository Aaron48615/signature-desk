#import "input.h"
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>
#import <IOKit/IOKitLib.h>

@interface InkCapture : NSView
@property FrameSink sink;
@property uint32_t session;
@property BOOL sawBeginning;
@property id device;
@end

static InkCapture *capture;
static CGPoint previousPointer;
static __weak NSResponder *previousResponder;
static BOOL detached;
static IONotificationPortRef notifications;
static io_iterator_t removals;

@implementation InkCapture
- (BOOL)acceptsFirstResponder {
  return YES;
}
- (BOOL)isOpaque {
  return NO;
}
- (void)mouseDown:(NSEvent *)event {
}
- (void)mouseUp:(NSEvent *)event {
}
- (void)rightMouseDown:(NSEvent *)event {
}
- (void)rightMouseUp:(NSEvent *)event {
}
- (void)scrollWheel:(NSEvent *)event {
}
- (void)keyDown:(NSEvent *)event {
  if (event.keyCode == 53)
    self.sink(self.session, -1, 0, 0, 0, event.timestamp * 1000);
}
- (void)read:(NSEvent *)event {
  if (!self.sawBeginning)
    return;
  NSSet<NSTouch *> *touches = [event touchesMatchingPhase:NSTouchPhaseTouching
                                                   inView:self];
  NSTouch *t = touches.anyObject;
  if (!t) {
    self.sink(self.session, 0, 0, 0, 0, event.timestamp * 1000);
    self.device = nil;
    return;
  }
  if (self.device && ![self.device isEqual:t.device]) {
    self.sink(self.session, 2, 0, 0, 0, event.timestamp * 1000);
    return;
  }
  self.device = t.device;
  NSSize size = t.deviceSize;
  if (size.height <= 0 || size.width <= 0)
    return;
  self.sink(self.session, (int)touches.count, t.normalizedPosition.x,
            1.0 - t.normalizedPosition.y, size.width / size.height, event.timestamp * 1000);
}
- (void)touchesBeganWithEvent:(NSEvent *)event {
  self.sawBeginning = YES;
  [self read:event];
}
- (void)touchesMovedWithEvent:(NSEvent *)event {
  [self read:event];
}
- (void)touchesEndedWithEvent:(NSEvent *)event {
  [self read:event];
}
- (void)touchesCancelledWithEvent:(NSEvent *)event {
  self.sink(self.session, -2, 0, 0, 0, event.timestamp * 1000);
}
@end

static void drain(io_iterator_t iterator) {
  io_object_t service;
  while ((service = IOIteratorNext(iterator)))
    IOObjectRelease(service);
}
static void removed(void *context, io_iterator_t iterator) {
  (void)context;
  drain(iterator);
  if (capture)
    capture.sink(capture.session, -2, 0, 0, 0, 0);
}
void ink_devices(DeviceSink sink) {
  // IOKit detects trackpad availability; AppKit supplies the size with the
  // first touch.
  io_service_t trackpad = IOServiceGetMatchingService(
      MACH_PORT_NULL, IOServiceMatching("AppleMultitouchDevice"));
  if (!trackpad) {
    NSMutableDictionary *match =
        CFBridgingRelease(IOServiceMatching("IOHIDDevice"));
    match[@"PrimaryUsagePage"] = @13;
    match[@"PrimaryUsage"] = @5;
    trackpad = IOServiceGetMatchingService(
        MACH_PORT_NULL, (__bridge_retained CFDictionaryRef)match);
  }
  if (trackpad) {
    sink("appkit", "Mac 触控板", 0, 0);
    IOObjectRelease(trackpad);
  }
}
int ink_start(void *handle, const char *device, double ratio, uint32_t session,
              FrameSink sink) {
  (void)device;
  (void)ratio;
  NSWindow *window = (__bridge NSWindow *)handle;
  if (!window.isKeyWindow || capture)
    return 1;
  NSView *content = window.contentView;
  capture = [[InkCapture alloc] initWithFrame:content.bounds];
  capture.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  capture.allowedTouchTypes = NSTouchTypeMaskIndirect;
  capture.wantsRestingTouches = YES;
  capture.sink = sink;
  capture.session = session;
  [content addSubview:capture positioned:NSWindowAbove relativeTo:nil];
  previousResponder = window.firstResponder;
  [window makeFirstResponder:capture];
  CGEventRef event = CGEventCreate(NULL);
  if (!event) {
    ink_stop();
    return 1;
  }
  previousPointer = CGEventGetLocation(event);
  CFRelease(event);
  NSPoint center =
      [window convertPointToScreen:NSMakePoint(NSMidX(content.bounds),
                                               NSMidY(content.bounds))];
  CGPoint target = CGPointMake(
      center.x, NSMaxY(NSScreen.screens.firstObject.frame) - center.y);
  if (CGWarpMouseCursorPosition(target) != kCGErrorSuccess ||
      CGAssociateMouseAndMouseCursorPosition(false) != kCGErrorSuccess) {
    ink_stop();
    return 1;
  }
  detached = YES;
  [NSCursor hide];
  notifications = IONotificationPortCreate(MACH_PORT_NULL);
  if (notifications) {
    IONotificationPortSetDispatchQueue(notifications,
                                       dispatch_get_main_queue());
    if (IOServiceAddMatchingNotification(
            notifications, kIOTerminatedNotification,
            IOServiceMatching("AppleMultitouchDevice"), removed, NULL,
            &removals) == KERN_SUCCESS)
      drain(removals);
  }
  return 0;
}
void ink_stop(void) {
  if (removals) {
    IOObjectRelease(removals);
    removals = 0;
  }
  if (notifications) {
    IONotificationPortDestroy(notifications);
    notifications = NULL;
  }
  if (detached) {
    CGAssociateMouseAndMouseCursorPosition(true);
    CGWarpMouseCursorPosition(previousPointer);
    [NSCursor unhide];
    detached = NO;
  }
  NSWindow *window = capture.window;
  [capture removeFromSuperview];
  if (window.isKeyWindow && previousResponder) [window makeFirstResponder:previousResponder];
  previousResponder = nil;
  capture = nil;
}
