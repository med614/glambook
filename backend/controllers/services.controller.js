import { supabase } from '../lib/supabase.js'

export const getAllServices = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('services')
            .select('*')
            .eq('is_active', true)
            .order('name')

        if (error) throw error

        res.json(data)
    } catch (error) {
        console.error('Error fetching services:', error)
        res.status(500).json({ error: error.message })
    }
}
