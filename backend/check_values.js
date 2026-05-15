import { supabase } from './lib/supabase.js'

async function checkValues() {
    console.log('Checking distinct statuses and types in appointments...')

    const { data: statusData, error: statusError } = await supabase
        .from('appointments')
        .select('status')

    if (statusData) {
        const statuses = [...new Set(statusData.map(i => i.status))]
        console.log('Statuses:', statuses)
    }

    const { data: typeData, error: typeError } = await supabase
        .from('appointments')
        .select('type')

    if (typeData) {
        const types = [...new Set(typeData.map(i => i.type))]
        console.log('Types:', types)
    }
}

checkValues().catch(console.error)
