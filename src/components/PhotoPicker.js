import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function PhotoPicker({ userId, photoUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false)

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
    const uri = result.assets[0].uri
    await upload(uri)
  }

  async function upload(uri) {
    setUploading(true)
    try {
      const ext = uri.split('.').pop().toLowerCase() || 'jpg'
      const path = `${userId}/${Date.now()}.${ext}`
      const response = await fetch(uri)
      const blob = await response.blob()
      const { error } = await supabase.storage.from('project-photos').upload(path, blob, { contentType: `image/${ext}`, upsert: true })
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
    Alert.alert('Add Photo', '', [
      { text: 'Take Photo', onPress: () => pick(true) },
      { text: 'Choose from Library', onPress: () => pick(false) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  return (
    <TouchableOpacity style={s.container} onPress={showOptions} disabled={uploading}>
      {photoUrl ? (
        <>
          <Image source={{ uri: photoUrl }} style={s.image} />
          <View style={s.changeOverlay}>
            <Text style={s.changeText}>{uploading ? '⏳ Uploading…' : '✏️ Change Photo'}</Text>
          </View>
        </>
      ) : (
        <View style={s.placeholder}>
          {uploading
            ? <ActivityIndicator color="#C8402F" />
            : <>
                <Text style={s.placeholderIcon}>📷</Text>
                <Text style={s.placeholderText}>Tap to add a photo</Text>
              </>
          }
        </View>
      )}
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  container: { borderRadius: 12, overflow: 'hidden', marginBottom: 20, backgroundColor: '#F0EDE8' },
  image: { width: '100%', height: 200, resizeMode: 'cover' },
  changeOverlay: { position: 'absolute', bottom: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  changeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  placeholder: { height: 140, alignItems: 'center', justifyContent: 'center', gap: 6 },
  placeholderIcon: { fontSize: 28 },
  placeholderText: { fontSize: 13, color: '#8C8880' },
})
