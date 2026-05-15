import axios from 'axios'
import dotenv from 'dotenv'

dotenv.config()

const API_URL = 'http://localhost:3000'

async function testCreateWalkin() {
    console.log('Testing Create Walkin...')

    try {
        const payload = {
            client_name: "Test Walkin " + Date.now(),
            service_id: "invalid-uuid-custom-service", // test custom service name handling
            start_time: new Date().toISOString(),
            type: 'walkin',
            status: 'waiting',
            note: 'Test note'
        }

        console.log('Sending payload:', payload)

        const response = await axios.post(`${API_URL}/appointments`, payload)

        console.log('Success! Created appointment:', response.data)
    } catch (error) {
        if (error.response) {
            console.error('API Error:', error.response.status, error.response.data)
        } else {
            console.error('Connection Error:', error.message)
        }
    }
}

testCreateWalkin()
