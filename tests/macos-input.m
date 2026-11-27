// Synthetic AppKit events sent to the production view without enabling input.
#import <AppKit/AppKit.h>
#import "../src-tauri/native/input.h"
#import <assert.h>

@interface InkCapture : NSView
@property FrameSink sink;
@end

@interface Contact : NSObject
@property NSPoint normalizedPosition;
@property id identity;
@property id device;
@end
@implementation Contact
- (NSSize)deviceSize {
  return NSMakeSize(150, 100);
}
@end

@interface ContactEvent : NSObject
@property NSSet *touching;
@property NSSet *ended;
@end
@implementation ContactEvent
- (NSSet *)touchesMatchingPhase:(NSTouchPhase)phase inView:(NSView *)view {
  assert(view);
  return phase == NSTouchPhaseTouching ? self.touching : self.ended;
}
- (NSTimeInterval)timestamp {
  return 4.5;
}
@end

static int counts[8], frames;
static NSPoint lastPoint;
static void record(uint32_t session, int count, double x, double y,
                   double ratio, double time) {
  assert(frames < 8 && time == 4500);
  counts[frames++] = count;
  if (count == 1) {
    assert(ratio == 1.5);
    lastPoint = NSMakePoint(x, y);
  }
}
static Contact *contact(id identity, id device, CGFloat x, CGFloat y) {
  Contact *t = [Contact new];
  t.identity = identity;
  t.device = device;
  t.normalizedPosition = NSMakePoint(x, y);
  return t;
}
static NSEvent *event(NSArray *active, NSArray *ended) {
  ContactEvent *e = [ContactEvent new];
  e.touching = [NSSet setWithArray:active];
  e.ended = [NSSet setWithArray:ended];
  return (NSEvent *)e;
}

static NSEvent *arrow(unsigned short code, BOOL repeat, NSEventModifierFlags flags) {
  return [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint
                     modifierFlags:flags timestamp:4.5 windowNumber:0 context:nil
                        characters:@"" charactersIgnoringModifiers:@""
                         isARepeat:repeat keyCode:code];
}

int main(void) {
  @autoreleasepool {
    InkCapture *view = [[InkCapture alloc] initWithFrame:NSZeroRect];
    view.sink = record;
    [view keyDown:arrow(123, NO, NSEventModifierFlagFunction)];
    [view keyDown:arrow(124, NO, 0)];
    [view keyDown:arrow(123, YES, 0)];
    [view keyDown:arrow(124, NO, NSEventModifierFlagCommand)];
    assert(frames == 2 && counts[0] == INK_UNDO && counts[1] == INK_REDO);
    frames = 0;
    Contact *down = contact(@1, @11, 0.25, 0.75);
    Contact *other = contact(@2, @11, 0.8, 0.2);
    Contact *lift = contact(@1, @11, 0.5, 0.625);
    [view touchesBeganWithEvent:event(@[ down ], @[])];
    [view touchesEndedWithEvent:event(@[], @[ lift ])];
    assert(frames == 3 && counts[0] == 1 && counts[1] == 1 && counts[2] == 0);
    assert(NSEqualPoints(lastPoint, NSMakePoint(0.5, 0.375)));

    // An unavailable, stationary or unrelated lift cannot supply new ink.
    for (NSArray *ended in @[
           @[], @[ down ], @[ other ],
           @[ contact(@1, @22, 0.8, 0.2) ], @[ down, other ]
         ]) {
      frames = 0;
      [view touchesBeganWithEvent:event(@[ down ], @[])];
      [view touchesEndedWithEvent:event(@[], ended)];
      assert(frames == 2 && counts[0] == 1 && counts[1] == 0);
    }
    frames = 0;
    [view touchesBeganWithEvent:event(@[ down ], @[])];
    [view touchesBeganWithEvent:event(@[ down, other ], @[])];
    [view touchesEndedWithEvent:event(@[], @[ lift ])];
    assert(frames == 3 && counts[0] == 1 && counts[1] == 2 && counts[2] == 0);
    frames = 0;
    [view touchesBeganWithEvent:event(@[ down ], @[])];
    [view touchesCancelledWithEvent:event(@[], @[ lift ])];
    assert(frames == 2 && counts[0] == 1 && counts[1] == -2);
    puts("PASS macOS single-contact lift, stationary or unrelated ends, "
         "multitouch and cancellation");
  }
}
