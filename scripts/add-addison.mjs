import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(l => {
      const idx = l.indexOf('=');
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, key);

async function addAddison() {
  const addisonId = '9088052874';

  console.log('1. Calling override_candidate_status(1, 2, addisonId, "approved")...');
  const { error: rpcErr } = await supabase.rpc('override_candidate_status', {
    p_section: 1,
    p_round: 2,
    p_student_id: addisonId,
    p_status: 'approved'
  });

  if (rpcErr) {
    console.error('RPC Error:', rpcErr);
  } else {
    console.log('Successfully called override_candidate_status!');
  }

  console.log('2. Appending Addison Dowe to active pnm_order in voting-ops and updating invite_quota...');
  const { data: opsData, error: opsFetchErr } = await supabase
    .from('voting-ops')
    .select('*')
    .eq('id', 1)
    .single();

  if (opsFetchErr) {
    console.error('Error fetching voting-ops:', opsFetchErr);
    return;
  }

  const currentOrder = opsData.pnm_order || [];
  let newOrder = [...currentOrder];
  if (!newOrder.includes(addisonId)) {
    newOrder.push(addisonId);
  }

  const { data: updateData, error: opsUpdateErr } = await supabase
    .from('voting-ops')
    .update({
      pnm_order: newOrder,
      invite_quota: 45,
      updated_at: new Date().toISOString()
    })
    .eq('id', 1)
    .select();

  console.log('Update return:', { updateData, opsUpdateErr });

  // Verify
  const { data: verifyOps } = await supabase.from('voting-ops').select('pnm_order, invite_quota').eq('id', 1).single();
  const { data: verifyS2 } = await supabase.from('voting-s2-r1').select('id, status').eq('id', addisonId);
  console.log('\n--- Verification ---');
  console.log('Addison in voting-s2-r1:', verifyS2);
  console.log('New pnm_order length:', verifyOps?.pnm_order?.length);
  console.log('Addison included in pnm_order:', verifyOps?.pnm_order?.includes(addisonId));
  console.log('Position in queue:', verifyOps?.pnm_order?.indexOf(addisonId) + 1);
}

addAddison();
