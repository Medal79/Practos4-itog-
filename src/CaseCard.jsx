import { Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { getPrice } from './price';
import Img from './Img';

/**
 * Карточка кейса в каталоге: картинка, название, описание, длительность, цена.
 * Все названия (категория и т.д.) приходят с сервера уже готовыми — их собирает JOIN-запрос.
 */
function CaseCard({ item, onAdd }) {
  const { user } = useAuth();
  const { percent, final, old, byCoupon } = getPrice(item, user);

  return (
    <div className="card">
      {percent > 0 && <span className="badge">-{percent}%</span>}
      <Link to={`/case/${item.id}`}>
        <Img className="card-img" src={item.image_url} alt={item.name} />
      </Link>
      <h3>
        <Link to={`/case/${item.id}`}>{item.name}</Link>
      </h3>
      <p className="muted">{item.category_name || 'Без категории'}</p>
      <p className="muted">{item.description}</p>
      <p className="duration">Длительность: {item.duration_days} дн.</p>
      {item.reviews_count > 0 && (
        <p className="muted">★ {item.avg_rating} ({item.reviews_count})</p>
      )}
      <p className="price">
        {percent > 0 && <s className="muted">{old} руб. </s>}
        <b>{final} руб.</b>
        {percent > 0 && byCoupon && <span className="muted"> (ваш купон)</span>}
      </p>
      {onAdd && <button onClick={onAdd}>В корзину</button>}
    </div>
  );
}

export default CaseCard;
