import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://xhkcqnyhtdifdofldtqh.supabase.co";
const supabasePublishableKey = "sb_publishable_QL4UrPrIMgE_wyWC8kCIQ_T0rlCgQl";

export const supabase = createClient(supabaseUrl, supabasePublishableKey);
