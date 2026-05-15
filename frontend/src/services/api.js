import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json'
    }
})

// Add response interceptor for validation/errors if needed
api.interceptors.response.use(
    response => response.data,
    error => {
        console.error('API Call Error:', error)
        return Promise.reject(error)
    }
)

export default api
