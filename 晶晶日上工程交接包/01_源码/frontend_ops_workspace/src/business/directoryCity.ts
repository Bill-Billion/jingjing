import { readonly, ref } from 'vue'

// A manual directory preference for this running workspace, never a location
// permission or a fabricated city code. Individual directories may override it.
const city = ref('')
export const directoryCity = readonly(city)

export function setDirectoryCity(value: string) {
  const next = value.trim()
  if (next.length > 100 || /[\r\n\u0000-\u001f]/.test(next)) {
    throw new Error('请填写100字以内的城市名称。')
  }
  city.value = next
}
