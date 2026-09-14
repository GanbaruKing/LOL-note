import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'
import type { NotebookApi } from '../../shared/contracts'

declare global {
  interface Window {
    notebook: NotebookApi
  }
}

class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="fatal">
        <h1>画面を表示できませんでした</h1>
        <p>保存済みのデータはそのまま残っています。</p>
        <button onClick={() => location.reload()}>再読み込み</button>
      </div>
    ) : (
      this.props.children
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
