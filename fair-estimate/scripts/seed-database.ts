import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const SEED_DIR = path.join(process.cwd(), 'src/data/seed');

async function seedLaborRates() {
  console.log('Seeding labor rates...');
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'labor-rates.json'), 'utf-8'));
  const { error } = await supabase.from('labor_rates').upsert(data);
  if (error) console.error('Error seeding labor_rates:', error.message);
  else console.log(`✓ Seeded ${data.length} labor rates`);
}

async function seedAutoRepairBenchmarks() {
  console.log('Seeding auto repair benchmarks...');
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'common-repairs-auto.json'), 'utf-8'));
  const { error } = await supabase.from('auto_service_benchmarks').upsert(data);
  if (error) console.error('Error seeding auto_service_benchmarks:', error.message);
  else console.log(`✓ Seeded ${data.length} auto repair benchmarks`);
}

async function seedHomeServiceBenchmarks() {
  console.log('Seeding home service benchmarks...');
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'common-home-services.json'), 'utf-8'));
  const { error } = await supabase.from('home_service_benchmarks').upsert(data);
  if (error) console.error('Error seeding home_service_benchmarks:', error.message);
  else console.log(`✓ Seeded ${data.length} home service benchmarks`);
}

async function seedAutoUpsellKnowledge() {
  console.log('Seeding auto upsell knowledge...');
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'upsell-knowledge-auto.json'), 'utf-8'));
  const { error } = await supabase.from('auto_upsell_knowledge').upsert(data);
  if (error) console.error('Error seeding auto_upsell_knowledge:', error.message);
  else console.log(`✓ Seeded ${data.length} auto upsell patterns`);
}

async function seedHomeUpsellKnowledge() {
  console.log('Seeding home upsell knowledge...');
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'upsell-knowledge-home.json'), 'utf-8'));
  const { error } = await supabase.from('home_upsell_knowledge').upsert(data);
  if (error) console.error('Error seeding home_upsell_knowledge:', error.message);
  else console.log(`✓ Seeded ${data.length} home upsell patterns`);
}

async function seedDIYKnowledge() {
  console.log('Seeding DIY knowledge...');
  const data = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'diy-knowledge.json'), 'utf-8'));

  // Auto DIY
  if (data.auto_repair && data.auto_repair.length > 0) {
    const { error } = await supabase.from('auto_diy_knowledge').upsert(data.auto_repair);
    if (error) console.error('Error seeding auto_diy_knowledge:', error.message);
    else console.log(`✓ Seeded ${data.auto_repair.length} auto DIY entries`);
  }

  // Home DIY (hvac, plumbing, electrical, appliance)
  const homeCategories = ['hvac', 'plumbing', 'electrical', 'appliance_repair'];
  const homeItems: Record<string, unknown>[] = [];

  for (const category of homeCategories) {
    if (data[category]) {
      homeItems.push(...data[category]);
    }
  }

  if (homeItems.length > 0) {
    const { error } = await supabase.from('home_diy_knowledge').upsert(homeItems);
    if (error) console.error('Error seeding home_diy_knowledge:', error.message);
    else console.log(`✓ Seeded ${homeItems.length} home DIY entries`);
  }
}

async function main() {
  console.log('Starting database seed...');
  console.log(`Supabase URL: ${supabaseUrl}`);

  await seedLaborRates();
  await seedAutoRepairBenchmarks();
  await seedHomeServiceBenchmarks();
  await seedAutoUpsellKnowledge();
  await seedHomeUpsellKnowledge();
  await seedDIYKnowledge();

  console.log('\n✅ Database seeding complete!');
}

main().catch(console.error);
