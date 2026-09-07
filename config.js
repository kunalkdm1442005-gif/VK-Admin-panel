/* Same Supabase project your storefront already uses.
   The anon key is safe to expose publicly (it's already public in your
   storefront's script.js) — real protection comes from the Row Level
   Security policies + admin_users allowlist set up by the SQL migration. */
window.VK_ADMIN_CONFIG = {
  SUPABASE_URL: "https://owpgbkrnimhwvgqntggq.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_yVu_tEIx690wZny03SmjBg_yNQX8toM",
  STORAGE_BUCKET: "product-images",
};
