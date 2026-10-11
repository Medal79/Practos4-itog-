import { Component } from 'react';

/**
 * Ловит ошибки отрисовки в любом компоненте ниже по дереву.
 * Вместо чёрного экрана показывает текст ошибки (и она же остаётся в консоли браузера, F12).
 * Error Boundary в React можно сделать только классом — это единственное исключение из функциональных компонентов.
 */
class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Ошибка отрисовки:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ padding: 24, color: '#ff6b6b', fontFamily: 'sans-serif' }}>
        <h2>Что-то пошло не так</h2>
        <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error?.stack || this.state.error)}</pre>
        <button onClick={() => { localStorage.removeItem('token'); window.location.reload(); }}>
          Сбросить вход и перезагрузить
        </button>
      </div>
    );
  }
}

export default ErrorBoundary;