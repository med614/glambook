import { supabase } from './lib/supabase.js'

async function checkTables() {
    const tables = ['staff', 'services', 'appointments', 'walkins', 'queue', 'clients']
    console.log('Checking tables...')

    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('*').limit(1)
        if (error) {
            console.log(`Table '${table}': ERROR - ${error.message} (Code: ${error.code})`)
        } else {
            console.log(`Table '${table}': EXISTS`)
            if (data.length > 0) {
                console.log(`  Sample keys: ${Object.keys(data[0]).join(', ')}`)
            } else {
                console.log(`  (Empty table)`)
            }
        }
    }
}

checkTables().catch(console.error)
