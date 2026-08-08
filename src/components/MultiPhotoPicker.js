import { View, Text, Image, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, ScrollView } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const ACCENT = '#C8402F'
export const FREE_PHOTO_LIMIT = 5
export const PRO_PHOTO_LIMIT = 25

export default function MultiPhotoPicker({ userId, photos = [], onUpdate, isPro = false, onUpgrade, additionalPhotoCount = 0 }) {
  const [uploading, setUploading] = useState(false)
  const photoLimit = isPro ? PRO_PHOTO_LIMIT : FREE_PHOTO_LIMIT
  const totalPhotoCount = photos.length + additionalPhotoCount

  function showUpgradePrompt() {
    Alert.alert(
      'Unlock more project photos with SideFlip Pro',
      `Free projects include up to ${FREE_PHOTO_LIMIT} total photos, including before and after photos. SideFlip Pro expands each project to ${PRO_PHOTO_LIMIT} photos.`,
      [
        { text: 'Not Now', style: 'cancel' },
        { text: 'View SideFlip Pro', onPress: onUpgrade },
      ]
    )
  }

  function showLimitPrompt() {
    if (!isPro) return showUpgradePrompt()
    Alert.alert('Photo limit reached', `SideFlip Pro supports up to ${PRO_PHOTO_LIMIT} photos per project.`)
  }

  async function pick(useCamera) {
    if (totalPhotoCount >= photoLimit) return showLimitPrompt()

    const permFn = useCamera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync
    const { granted } = await permFn()
    if (!granted) return Alert.alert('Permission required', 'Photo access is needed.')

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsMultipleSelection: true })

    if (result.canceled) return

    const remaining = photoLimit - totalPhotoCount
    const selectedAssets = result.assets.slice(0, remaining)
    await uploadAll(selectedAssets)
    if (result.assets.length > remaining) showLimitPrompt()
  }

  async function uploadAll(assets) {
    setUploading(true)
    try {
      const urls = []
      for (const asset of assets) {
        const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`
        const response = await fetch(asset.uri)
        const arrayBuffer = await response.arrayBuffer()
        const { error } = await supabase.storage.from('project-photos').upload(path, new Uint8Array(arrayBuffer), { contentType: 'image/jpeg', upsert: true })
        if (error) throw error
        const { data } = supabase.storage.from('project-photos').getPublicUrl(path)
        urls.push(data.publicUrl)
      }
      await onUpdate([...photos, ...urls])
    } catch (err) {
      Alert.alert('Upload failed', err.message)
    } finally {
      setUploading(false)
    }
  }

  function removePhoto(url) {
    Alert.alert('Remove photo?', '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await onUpdate(photos.filter(p => p !== url))
        } catch (err) {
          Alert.alert('Could not remove photo', err.message)
        }
      }}
    ])
  }

  function showAddOptions() {
    if (totalPhotoCount >= photoLimit) return showLimitPrompt()
    Alert.alert('Add Photo', '', [
      { text: 'Take Photo', onPress: () => pick(true) },
      { text: 'Choose from Library', onPress: () => pick(false) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  return (
    <View style={s.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scroll}>
        {photos.map((url, i) => (
          <TouchableOpacity key={url} onPress={() => removePhoto(url)} style={s.photoWrap}>
            <Image source={{ uri: url }} style={s.photo} resizeMode="cover" />
            <View style={s.removeBtn}><Text style={s.removeTxt}>✕</Text></View>
            {i === 0 && <View style={s.primaryBadge}><Text style={s.primaryTxt}>Main</Text></View>}
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.addBtn} onPress={showAddOptions} disabled={uploading}>
          {uploading
            ? <ActivityIndicator color={ACCENT} />
            : <>
                <Text style={s.addIcon}>📷</Text>
                <Text style={s.addTxt}>{totalPhotoCount >= photoLimit ? 'Limit Reached' : (photos.length === 0 ? 'Add Photo' : 'Add More')}</Text>
              </>
          }
        </TouchableOpacity>
      </ScrollView>
      <Text style={s.hint}>
        {photos.length > 0 ? 'Tap a photo to remove · First photo is main · ' : ''}
        {totalPhotoCount}/{photoLimit} photos
      </Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: { marginBottom: 20 },
  scroll: { gap: 10, paddingVertical: 4 },
  photoWrap: { position: 'relative' },
  photo: { width: 110, height: 110, borderRadius: 12 },
  removeBtn: { position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  removeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  primaryBadge: { position: 'absolute', bottom: 6, left: 6, backgroundColor: ACCENT, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  primaryTxt: { color: '#fff', fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  addBtn: { width: 110, height: 110, borderRadius: 12, backgroundColor: '#F0EDE8', borderWidth: 2, borderColor: '#E8E4DE', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 },
  addIcon: { fontSize: 24 },
  addTxt: { fontSize: 12, color: '#8C8880', fontWeight: '600' },
  hint: { fontSize: 11, color: '#A8A49E', marginTop: 6 },
})
