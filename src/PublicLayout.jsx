import { Outlet } from 'react-router-dom';
import Menu from './Menu';

// Общий макет сайта: меню сверху и содержимое текущей страницы
function PublicLayout() {
  return (
    <>
      <Menu />
      <div className="page">
        <Outlet />
      </div>
    </>
  );
}

export default PublicLayout;