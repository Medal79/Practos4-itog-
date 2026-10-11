/**
 * Единое сообщение «сервер недоступен» с кнопкой повтора.
 * Показывается вместо страницы, если не удалось даже определить, кто вошёл в систему.
 */
function ServerError({ message, onRetry }) {
  return (
    <div className="error">
      <h2>Сервер недоступен</h2>
      <p>Ошибка: {message}</p>
      {onRetry && <button onClick={onRetry}>Попробовать снова</button>}
    </div>
  );
}

export default ServerError;
