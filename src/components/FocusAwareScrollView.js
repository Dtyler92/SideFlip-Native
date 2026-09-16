import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { findNodeHandle, Keyboard, Platform, ScrollView, UIManager } from 'react-native'
import {
  claimFocusEvent,
  keyboardRevealDelta,
  keyboardRevealScrollPosition,
  keyboardTopFromViewport,
  shouldRevealFocusedField,
} from '../lib/keyboardVisibility'

const DEFAULT_EXTRA_SCROLL_HEIGHT = 28

function measureInWindow(target, callback) {
  if (typeof target?.measureInWindow === 'function') {
    target.measureInWindow(callback)
    return true
  }
  const nativeHandle = typeof target === 'number' ? target : findNodeHandle(target)
  if (!nativeHandle) return false
  UIManager.measureInWindow(nativeHandle, callback)
  return true
}

const FocusAwareScrollView = forwardRef(function FocusAwareScrollView({
  children,
  extraScrollHeight = DEFAULT_EXTRA_SCROLL_HEIGHT,
  horizontal = false,
  onBlur,
  onFocus,
  onLayout,
  onScroll,
  ...props
}, forwardedRef) {
  const scrollRef = useRef(null)
  const focusOwner = useRef({})
  const focusedTarget = useRef(null)
  const ownsFocusedField = useRef(false)
  const keyboardTop = useRef(null)
  const scrollX = useRef(0)
  const scrollY = useRef(0)
  const revealFrame = useRef(null)
  const layoutFrame = useRef(null)

  useImperativeHandle(forwardedRef, () => scrollRef.current)

  const revealMeasuredField = useCallback(() => {
    const target = focusedTarget.current
    if (!shouldRevealFocusedField({
      ownsFocus: ownsFocusedField.current,
      horizontal,
      target,
      keyboardY: keyboardTop.current,
    })) return false
    return measureInWindow(target, (_x, fieldY, _width, fieldHeight) => {
      if (!ownsFocusedField.current || target !== focusedTarget.current) return
      const delta = keyboardRevealDelta({
        fieldY,
        fieldHeight,
        keyboardY: keyboardTop.current,
        gap: extraScrollHeight,
      })
      if (delta > 0) {
        scrollRef.current?.scrollTo(keyboardRevealScrollPosition({
          scrollX: scrollX.current,
          scrollY: scrollY.current,
          delta,
        }))
      }
    })
  }, [extraScrollHeight, horizontal])

  const scheduleMeasuredReveal = useCallback(() => {
    if (revealFrame.current != null) cancelAnimationFrame(revealFrame.current)
    revealFrame.current = requestAnimationFrame(() => {
      revealFrame.current = null
      revealMeasuredField()
    })
  }, [revealMeasuredField])

  const refreshAndroidKeyboardBoundary = useCallback(() => {
    if (Platform.OS !== 'android' || !ownsFocusedField.current || !Number.isFinite(keyboardTop.current)) return
    if (layoutFrame.current != null) cancelAnimationFrame(layoutFrame.current)
    layoutFrame.current = requestAnimationFrame(() => {
      layoutFrame.current = null
      scrollRef.current?.measureInWindow?.((_x, viewportY, _width, viewportHeight) => {
        const nextKeyboardTop = keyboardTopFromViewport({ viewportY, viewportHeight })
        if (nextKeyboardTop == null || !ownsFocusedField.current) return
        keyboardTop.current = nextKeyboardTop
        scheduleMeasuredReveal()
      })
    })
  }, [scheduleMeasuredReveal])

  const revealFocusedField = useCallback(target => {
    if (!target || horizontal) return
    focusedTarget.current = target
    ownsFocusedField.current = true
    if (Number.isFinite(keyboardTop.current)) {
      scheduleMeasuredReveal()
      return
    }
    scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard?.(target, extraScrollHeight, true)
  }, [extraScrollHeight, horizontal, scheduleMeasuredReveal])

  const handleFocus = useCallback(event => {
    if (claimFocusEvent(event, focusOwner.current)) {
      revealFocusedField(event.nativeEvent?.target || event.target)
    }
    onFocus?.(event)
  }, [onFocus, revealFocusedField])

  const handleBlur = useCallback(event => {
    const target = event.nativeEvent?.target || event.target
    if (target == null || target === focusedTarget.current) {
      focusedTarget.current = null
      ownsFocusedField.current = false
    }
    onBlur?.(event)
  }, [onBlur])

  const handleLayout = useCallback(event => {
    onLayout?.(event)
    refreshAndroidKeyboardBoundary()
  }, [onLayout, refreshAndroidKeyboardBoundary])

  const handleScroll = useCallback(event => {
    const nextScrollX = event.nativeEvent?.contentOffset?.x
    const nextScrollY = event.nativeEvent?.contentOffset?.y
    if (Number.isFinite(nextScrollX)) scrollX.current = nextScrollX
    if (Number.isFinite(nextScrollY)) scrollY.current = nextScrollY
    onScroll?.(event)
  }, [onScroll])

  useEffect(() => {
    const updateKeyboardFrame = event => {
      keyboardTop.current = event.endCoordinates?.screenY
      if (ownsFocusedField.current) scheduleMeasuredReveal()
    }
    const showEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const showSubscription = Keyboard.addListener(showEventName, updateKeyboardFrame)
    const frameSubscription = Platform.OS === 'ios'
      ? Keyboard.addListener('keyboardWillChangeFrame', updateKeyboardFrame)
      : null
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null
      if (revealFrame.current != null) {
        cancelAnimationFrame(revealFrame.current)
        revealFrame.current = null
      }
      if (layoutFrame.current != null) {
        cancelAnimationFrame(layoutFrame.current)
        layoutFrame.current = null
      }
    })
    return () => {
      showSubscription.remove()
      frameSubscription?.remove()
      hideSubscription.remove()
      focusedTarget.current = null
      ownsFocusedField.current = false
      if (revealFrame.current != null) cancelAnimationFrame(revealFrame.current)
      if (layoutFrame.current != null) cancelAnimationFrame(layoutFrame.current)
    }
  }, [scheduleMeasuredReveal])

  return (
    <ScrollView
      ref={scrollRef}
      horizontal={horizontal}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      {...props}
      onBlur={handleBlur}
      onFocus={handleFocus}
      onLayout={handleLayout}
      onScroll={handleScroll}
    >
      {children}
    </ScrollView>
  )
})

export default FocusAwareScrollView
