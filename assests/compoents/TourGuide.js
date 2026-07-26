import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ChevronRight, X } from 'lucide-react-native';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * TourGuide — A step-by-step interactive app tour.
 *
 * Does NOT require wrapping elements in TourAnchor.
 * Instead, each step can optionally specify a targetRef (React ref)
 * to spotlight a specific element. If no ref is provided, the tooltip
 * appears centered on screen.
 *
 * Usage:
 *   <TourGuide
 *     steps={tourSteps}
 *     visible={showTour}
 *     onComplete={() => setShowTour(false)}
 *     onSkip={() => setShowTour(false)}
 *   />
 *
 * Each step shape:
 *   {
 *     title: string,
 *     description: string,
 *     targetRef?: React.RefObject,   // optional — for spotlight
 *     position?: 'center' | 'top' | 'bottom',
 *   }
 */

export default function TourGuide({
  steps = [],
  visible = false,
  onComplete,
  onSkip,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const totalSteps = steps.length;
  const step = steps[currentIndex];
  const isLast = currentIndex >= totalSteps - 1;

  // Pulse animation for spotlight border
  useEffect(() => {
    if (!visible) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 800,
          useNativeDriver: false,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: false,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [visible, pulseAnim]);

  // Measure target ref when step changes
  useEffect(() => {
    if (!visible || !step) {
      setTargetRect(null);
      return;
    }

    const ref = step.targetRef;
    if (!ref || !ref.current) {
      setTargetRect(null);
      return;
    }

    // Small delay to let layout settle
    const timer = setTimeout(() => {
      if (ref.current && ref.current.measureInWindow) {
        ref.current.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            const PAD = 12;
            setTargetRect({
              x: x - PAD,
              y: y - PAD,
              width: width + PAD * 2,
              height: height + PAD * 2,
            });
          } else {
            setTargetRect(null);
          }
        });
      } else {
        setTargetRect(null);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [visible, currentIndex, step]);

  const goNext = () => {
    if (isLast) {
      onComplete?.();
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleSkip = () => {
    setCurrentIndex(0);
    onSkip?.();
  };

  if (!visible || !step) return null;

  const spotlightScale = pulseAnim.interpolate({
    inputRange: [1, 1.08],
    outputRange: [1, 1.03],
  });

  // Determine tooltip position
  const hasSpotlight = targetRect !== null;
  const tooltipAbove =
    hasSpotlight && targetRect.y + targetRect.height + 200 > SCREEN_HEIGHT;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={handleSkip}
    >
      <View style={styles.overlay} pointerEvents="box-none">
        {/* Semi-transparent background with optional spotlight cutout */}
        {hasSpotlight ? (
          <>
            <View
              style={[
                styles.blocker,
                { top: 0, left: 0, right: 0, height: targetRect.y },
              ]}
            />
            <View
              style={[
                styles.blocker,
                {
                  top: targetRect.y + targetRect.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
              ]}
            />
            <View
              style={[
                styles.blocker,
                {
                  top: targetRect.y,
                  left: 0,
                  width: targetRect.x,
                  height: targetRect.height,
                },
              ]}
            />
            <View
              style={[
                styles.blocker,
                {
                  top: targetRect.y,
                  left: targetRect.x + targetRect.width,
                  right: 0,
                  height: targetRect.height,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.spotlightBorder,
                {
                  left: targetRect.x,
                  top: targetRect.y,
                  width: targetRect.width,
                  height: targetRect.height,
                  transform: [{ scale: spotlightScale }],
                },
              ]}
            />
          </>
        ) : (
          <View style={[styles.blocker, StyleSheet.absoluteFill]} />
        )}

        {/* Tooltip card */}
        <View
          style={[
            styles.tooltip,
            hasSpotlight && tooltipAbove
              ? { bottom: SCREEN_HEIGHT - targetRect.y + 16 }
              : hasSpotlight
              ? { top: targetRect.y + targetRect.height + 16 }
              : { top: SCREEN_HEIGHT * 0.3 },
          ]}
        >
          {/* Step indicator */}
          <View style={styles.stepRow}>
            <Text style={styles.stepIndicator}>
              Step {currentIndex + 1} of {totalSteps}
            </Text>
            <TouchableOpacity onPress={handleSkip} style={styles.skipBtn}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.tooltipTitle}>{step.title}</Text>
          <Text style={styles.tooltipDesc}>{step.description}</Text>

          <View style={styles.tooltipActions}>
            <TouchableOpacity onPress={handleSkip} style={styles.skipTextBtn}>
              <Text style={styles.skipText}>Skip Tour</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={goNext} style={styles.nextBtn}>
              <Text style={styles.nextBtnText}>
                {isLast ? 'Finish' : 'Next'}
              </Text>
              <ChevronRight size={18} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Dots indicator */}
          <View style={styles.dotsRow}>
            {steps.map((_, idx) => (
              <View
                key={idx}
                style={[styles.dot, idx === currentIndex && styles.dotActive]}
              />
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  blocker: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  spotlightBorder: {
    position: 'absolute',
    borderRadius: 12,
    borderWidth: 2.5,
    borderColor: '#3B82F6',
    borderStyle: 'dashed',
  },
  tooltip: {
    position: 'absolute',
    left: 20,
    right: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  stepRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stepIndicator: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3B82F6',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  skipBtn: {
    padding: 4,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 6,
  },
  tooltipDesc: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 18,
  },
  tooltipActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipTextBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  skipText: {
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  nextBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    gap: 4,
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 14,
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D1D5DB',
  },
  dotActive: {
    backgroundColor: '#2563EB',
    width: 20,
  },
});
