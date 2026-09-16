import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'
import { Keyboard, Platform, ScrollView } from 'react-native'

const DEFAULT_EXTRA_SCROLL_HEIGHT = 28

const FocusAwareScrollView = forwardRef(function FocusAwareScrollView({
  children,
  extraScrollHeight = DEFAULT_EXTRA_SCROLL_HEIGHT,
  onFocus,
  ...props
}, forwardedRef) {
  const scrollRef = useRef(null)
  const focusedTarget = useRef(null)

  useImperativeHandle(forwardedRef, () => scrollRef.current)

  const revealFocusedField = useCallback(target => {
    if (!target) return
    focusedTarget.current = target
    scrollRef.current?.scrollResponderScrollNativeHandleToKeyboard?.(target, extraScrollHeight, true)
  }, [extraScrollHeight])

  const handleFocus = useCallback(event => {
    revealFocusedField(event.nativeEvent?.target || event.target)
    onFocus?.(event)
  }, [onFocus, revealFocusedField])

  useEffect(() => {
    const eventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow'
    const subscription = Keyboard.addListener(eventName, () => revealFocusedField(focusedTarget.current))
    return () => subscription.remove()
  }, [revealFocusedField])

  return (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      {...props}
      onFocus={handleFocus}
    >
      {children}
    </ScrollView>
  )
})

export default FocusAwareScrollView
