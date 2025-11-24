import { render } from 'preact'
import App from './App'
import '@tauri-apps/api'

const root = document.getElementById('root')
if (!root) {
  throw new Error("Root element with id 'root' not found")
}
render(<App />, root)
