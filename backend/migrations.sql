-- Необязательные «страховки» на уровне БД. Запустите один раз: psql -U postgres -d practos4 -f migrations.sql
-- Сервер и так проверяет всё это в коде, но ограничения в БД защищают от гонок и ручных правок.

-- 1) Цена кейса всегда больше нуля (купить за 0 нельзя)
DO $$ BEGIN
  ALTER TABLE cases ADD CONSTRAINT cases_price_positive CHECK (price > 0) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Количество в корзине: не меньше 1 (сверху его ограничивает только склад cases.stock, а не число 10)
ALTER TABLE cart_items DROP CONSTRAINT IF EXISTS cart_quantity_range;
DO $$ BEGIN
  ALTER TABLE cart_items ADD CONSTRAINT cart_quantity_min CHECK (quantity >= 1) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Один отзыв от пользователя на каждый кейс (на разные кейсы — сколько угодно).
--    Старый индекс «один отзыв на пользователя» (если он был создан) удаляем.
--    Если уже есть дубли по паре (пользователь, кейс), сначала удалите лишние, иначе индекс не создастся.
DROP INDEX IF EXISTS reviews_one_per_user;
CREATE UNIQUE INDEX IF NOT EXISTS reviews_one_per_user_case ON reviews (user_id, case_id);

-- 4) Приветственный купон на первый заказ (по желанию; его выдаёт сервер при регистрации)
INSERT INTO coupons (code, name, discount_percent)
VALUES ('WELCOME', 'Приветственная скидка на первый заказ', 10)
ON CONFLICT (code) DO NOTHING;

-- 5) Предмет попадает в инвентарь только после открытия кейса (флаг opened).
--    Уже существующие записи считаем открытыми (DEFAULT TRUE при добавлении колонки),
--    а все новые по умолчанию создаются неоткрытыми.
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS opened BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE inventory ALTER COLUMN opened SET DEFAULT FALSE;

-- 6) Время одного кейса в минутах и количество на складе (сервер добавляет эти колонки сам при запуске)
ALTER TABLE cases ADD COLUMN IF NOT EXISTS duration_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS stock INTEGER NOT NULL DEFAULT 100;