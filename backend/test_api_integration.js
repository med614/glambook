import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = 'http://localhost:3000'

async function testApi() {
    console.log('Testing/Verifying API endpoints...')

    try {
        // 1. Check Health
        console.log('\n--- HEAD TH ---')
        const health = await axios.get(`${API_URL}/health`)
        console.log('Health:', health.data)

        // 2. Check Staff
        console.log('\n--- STAFF ---')
        const staff = await axios.get(`${API_URL}/staff`)
        console.log(`Fetched ${staff.data.length} staff members.`)
        if (staff.data.length > 0) console.log('Sample:', staff.data[0].name)

        // 3. Check Services
        console.log('\n--- SERVICES ---')
        const services = await axios.get(`${API_URL}/services`)
        console.log(`Fetched ${services.data.length} services.`)
        if (services.data.length > 0) console.log('Sample:', services.data[0].name)

        // 4. Check Appointments (Default Today)
        console.log('\n--- APPOINTMENTS (Today) ---')
        const appointments = await axios.get(`${API_URL}/appointments`)
        console.log(`Fetched ${appointments.data.length} appointments for today.`)

    } catch (error) {
        if (error.response) {
            console.error('API Error:', error.response.status, error.response.data)
        } else {
            console.error('Connection Error:', error.message)
            console.log('Make sure the backend is running! (using npm run dev or node index.js)')
        }
    }
}

testApi()
