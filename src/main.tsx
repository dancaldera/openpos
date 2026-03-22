import { render } from 'preact'
import App from './App'

const root = document.getElementById('root')
if (!root) {
  throw new Error("Root element with id 'root' not found")
}
render(<App />, root)
