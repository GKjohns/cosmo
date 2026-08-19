/**
 * POST /api/upload — stub image upload endpoint
 * TODO: Replace with Supabase Storage upload:
 * const { data } = await supabase.storage.from('uploads').upload(path, file)
 */
export default defineEventHandler(async (event) => {
  // Stub: return a placeholder URL
  return {
    url: '/placeholder.jpeg',
    pathname: '/placeholder.jpeg'
  }
})
