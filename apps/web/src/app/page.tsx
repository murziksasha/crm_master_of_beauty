import Link from 'next/link';
import { CalendarHeart, Sparkles, Star } from 'lucide-react';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-cream">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-bold text-ink">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose text-white">
            <Sparkles size={18} />
          </span>
          Master of Beauty
        </div>
        <div className="flex gap-2">
          <Link href="/my" className="btn btn-ghost">
            Мій кабінет
          </Link>
          <Link href="/login" className="btn btn-ghost">
            Для персоналу
          </Link>
          <Link href="/book" className="btn btn-primary">
            Записатися
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-20 pt-10">
        <section className="grid items-center gap-10 md:grid-cols-2">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-rose-soft px-3 py-1 text-sm font-medium text-rose-dark">
              <Star size={14} /> Салон краси повного циклу
            </div>
            <h1 className="text-4xl font-bold leading-tight text-ink md:text-5xl">
              Краса, яка підкреслює вашу індивідуальність
            </h1>
            <p className="mt-4 text-lg text-ink-muted">
              Перукарські послуги, фарбування, нігті, масаж, косметологія, брови та макіяж.
              Записуйтесь онлайн у зручний час.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/book" className="btn btn-primary px-6 py-3 text-base">
                <CalendarHeart size={18} />
                Онлайн-запис
              </Link>
              <Link href="/my" className="btn btn-secondary px-6 py-3 text-base">
                Мій кабінет
              </Link>
              <Link href="/login" className="btn btn-ghost px-6 py-3 text-base">
                CRM для персоналу
              </Link>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['Перукарські', 'Стрижки, укладки, догляд'],
              ['Фарбування', 'Балаяж, мелірування, тонування'],
              ['Нігті', 'Манікюр, педикюр, гель-лак'],
              ['Масаж', 'Релакс і відновлення'],
              ['Косметологія', 'Чистка, пілінги, догляд'],
              ['Брови та вії', 'Корекція, ламінування'],
            ].map(([title, text]) => (
              <div key={title} className="card p-5">
                <div className="font-semibold text-ink">{title}</div>
                <div className="mt-1 text-sm text-ink-muted">{text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 card overflow-hidden">
          <div className="grid md:grid-cols-3">
            {[
              ['м. Київ', 'вул. Хрещатик, 15'],
              ['Графік', 'Пн–Сб 09:00–20:00'],
              ['Телефон', '+38 (044) 123-45-67'],
            ].map(([k, v]) => (
              <div key={k} className="border-b border-border p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
                <div className="text-sm text-ink-muted">{k}</div>
                <div className="mt-1 font-semibold">{v}</div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
