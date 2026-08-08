import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function PhotoPicker({ userId, photoUrl, onUploaded, totalPhotoCount = 0, isPro = false, onUpgrade }) {
  const [uploading, setUploading] = useState(false)
  const [imgError, setImgError] = useState(false)
  const photoLimit = isPro ? 25 : 5

  function showLimitPrompt() {
    if (isPro) return Alert.alert('Photo limit reached', 'SideFlip Pro supports up to 25 photos per project.')
    Alert.alert(
      'Unlock more project photos with SideFlip Pro',
      'Free projects include up to 5 total photos, including before and after photos. SideFlip Pro expands each project to 25 photos.',
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'View SideFlip Pro', onPress: onUpgrade },
      ]
    )
  }

  async function pick(useCamera) {
    const permFn = useCamera
      ? ImagePicker.requestCameraPermissionsAsync
      : ImagePicker.requestMediaLibraryPermissionsAsync
    const { granted } = await permFn()
    if (!granted) return Alert.alert('Permission required', useCamera ? 'Camera access is needed.' : 'Photo library access is needed.')

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [4, 3], quality: 0.7 })

    if (result.canceled) return
    await upload(result.assets[0])
  }

  async function upload(asset) {
    setUploading(true)
    setImgError(false)
    try {
      const path = `${userId}/${Date.now()}.jpg`

      // Use fetch + arraybuffer for reliable upload with correct content type
      const response = await fetch(asset.uri)
      const arrayBuffer = await response.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)

      const { error } = await supabase.storage
        .from('project-photos')
        .upload(path, uint8Array, { contentType: 'image/jpeg', upsert: true })

      if (error) throw error

      const { data } = supabase.storage.from('project-photos').getPublicUrl(path)
      onUploaded(data.publicUrl)
    } catch (err) {
      Alert.alert('Upload failed', err.message)
    } finally {
      setUploading(false)
    }
  }

  function showOptions() {
    if (!photoUrl && totalPhotoCount >= photoLimit) return showLimitPrompt()
    Alert.alert('Add Photo', '', [
      { text: 'Take Photo', onPress: () => pick(true) },
      { text: 'Choose from Library', onPress: () => pick(false) },
      photoUrl ? { text: 'Remove Photo', style: 'destructive', onPress: () => { onUploaded(null); setImgError(false) } } : null,
      { text: 'Cancel', style: 'cancel' },
    ].filter(Boolean))
  }

  const showImage = photoUrl && !imgError && !uploading

  return (
    <TouchableOpacity style={s.container} onPress={showOptions} disabled={uploading} activeOpacity={0.85}>
      {showImage ? (
        <>
          <Image
            source={{ uri: photoUrl }}
            style={s.image}
            resizeMode="cover"
            onError={() => setImgError(true)}
          />
          <View style={s.changeOverlay}>
            <Text style={s.changeText}>✏️ Change Photo</Text>
          </View>
        </>
      ) : (
        <View style={s.placeholder}>
          {uploading
            ? <>
                <ActivityIndicator color="#C8402F" size="large" />
                <Text style={s.placeholderText}>Uploading…</Text>
              </>
            : <>
                <Text style={s.placeholderIcon}>📷</Text>
                <Text style={s.placeholderText}>{imgError ? 'Tap to retry photo' : 'Tap to add a photo'}</Text>
              </>
          }
        </View>
      )}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  container: { borderRadius: 12, overflow: 'hidden', marginBottom: 20, backgroundColor: '#F0EDE8', minHeight: 140 },
  image: { width: '100%', height: 220 },
  changeOverlay: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  changeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  placeholder: { height: 140, alignItems: 'center', justifyContent: 'center', gap: 8 },
  placeholderIcon: { fontSize: 32 },
  placeholderText: { fontSize: 13, color: '#8C8880' },
})
