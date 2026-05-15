import { supabase } from '../lib/supabase.js'

export const getAllStaff = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('staff')
            .select('*')
            .eq('is_active', true) // Only active staff
            .order('name')

        if (error) throw error

        res.json(data)
    } catch (error) {
        console.error('Error fetching staff:', error)
        res.status(500).json({ error: error.message })
    }
}
