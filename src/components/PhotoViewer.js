import { useEffect, useRef } from 'react'
import { Animated, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

const MIN_SCALE = 1
const MAX_SCALE = 4
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))
const touchDistance = ([first, second]) => Math.hypot(second.pageX - first.pageX, second.pageY - first.pageY)
const touchCenter = ([first, second]) => ({ x: (first.pageX + second.pageX) / 2, y: (first.pageY + second.pageY) / 2 })

export default function PhotoViewer({ uri, visible, onClose }) {
  const scale = useRef(new Animated.Value(MIN_SCALE)).current
  const translateX = useRef(new Animated.Value(0)).current
  const translateY = useRef(new Animated.Value(0)).current
  const transform = useRef({ scale: MIN_SCALE, x: 0, y: 0 })
  const gesture = useRef({ distance: 0, center: null, scale: MIN_SCALE, x: 0, y: 0 })

  function setTransform(next) {
    transform.current = next
    scale.setValue(next.scale)
    translateX.setValue(next.x)
    translateY.setValue(next.y)
  }

  function reset(animated = true) {
    transform.current = { scale: MIN_SCALE, x: 0, y: 0 }
    if (!animated) return setTransform(transform.current)
    Animated.parallel([
      Animated.spring(scale, { toValue: MIN_SCALE, useNativeDriver: true }),
      Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
    ]).start()
  }

  useEffect(() => {
    if (!visible) reset(false)
  }, [visible])

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: event => event.nativeEvent.touches.length >= 2 || transform.current.scale > MIN_SCALE,
    onMoveShouldSetPanResponder: event => event.nativeEvent.touches.length >= 2 || transform.current.scale > MIN_SCALE,
    onPanResponderGrant: event => {
      const touches = event.nativeEvent.touches
      gesture.current = {
        distance: touches.length >= 2 ? touchDistance(touches) : 0,
        center: touches.length >= 2 ? touchCenter(touches) : null,
        ...transform.current,
      }
    },
    onPanResponderMove: (event, state) => {
      const touches = event.nativeEvent.touches
      const start = gesture.current
      if (touches.length >= 2 && start.distance > 0) {
        const center = touchCenter(touches)
        const nextScale = clamp(start.scale * touchDistance(touches) / start.distance, MIN_SCALE, MAX_SCALE)
        setTransform({
          scale: nextScale,
          x: nextScale === MIN_SCALE ? 0 : start.x + center.x - start.center.x,
          y: nextScale === MIN_SCALE ? 0 : start.y + center.y - start.center.y,
        })
      } else if (transform.current.scale > MIN_SCALE) {
        setTransform({ scale: transform.current.scale, x: start.x + state.dx, y: start.y + state.dy })
      }
    },
    onPanResponderRelease: () => {
      if (transform.current.scale <= MIN_SCALE) reset()
    },
    onPanResponderTerminate: () => {
      if (transform.current.scale <= MIN_SCALE) reset()
    },
  })).current

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={onClose}>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <View style={styles.stage} {...panResponder.panHandlers} accessibilityRole="image" accessibilityLabel="Expanded project photo">
          {!!uri && <Animated.Image
            source={{ uri }}
            resizeMode="contain"
            style={[styles.image, { transform: [{ translateX }, { translateY }, { scale }] }]}
          />}
        </View>
        <Pressable style={styles.close} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close photo viewer" hitSlop={12}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
        <Text style={styles.hint} accessibilityElementsHidden>Pinch to zoom · Drag to pan</Text>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  close: { position: 'absolute', top: 14, right: 14, minWidth: 72, minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: 'rgba(30,30,30,0.88)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { position: 'absolute', bottom: 18, alignSelf: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.58)', borderRadius: 15, paddingHorizontal: 12, paddingVertical: 6, fontSize: 12 },
})
