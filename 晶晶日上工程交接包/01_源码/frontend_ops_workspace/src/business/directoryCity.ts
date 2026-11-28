import { readonly, ref } from 'vue'

// A manual directory preference for this running workspace, never a location
// permission or a fabricated city code. Individual directories may override it.
const city = ref('')
export const directoryCity = readonly(city)

export function normalizeDirectoryCity(value: unknown) {
  if (typeof value !== 'string' || /[\u0000-\u001f]/.test(value)) return null
  const cityName = value.trim()
  return cityName.length <= 100 ? cityName : null
}

export function setDirectoryCity(value: string) {
  const next = normalizeDirectoryCity(value.trim())
  if (next === null) throw new Error('请填写100字以内的城市名称。')
  city.value = next
}
