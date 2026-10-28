import { NavLink, Route, Routes } from 'react-router';

function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 sm:px-10">
      <div className="mb-10 flex items-center gap-2 text-sm font-medium text-stone-500">
        <span>Proyecto</span><span aria-hidden="true">/</span><span className="text-stone-800">Base inicial</span>
      </div>
      <section className="rounded-3xl bg-[#183b32] px-8 py-10 text-white shadow-sm sm:px-12 sm:py-14">
        <p className="mb-4 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-200">Daplace Rentals</p>
        <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">Una base clara para el trabajo diario.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-emerald-50/80">La interfaz y la API están listas para incorporar las tareas aprobadas del MVP.</p>
      </section>
      <section className="mt-10" aria-labelledby="base-title">
        <h2 id="base-title" className="mb-4 text-sm font-semibold uppercase tracking-wide text-stone-500">Base técnica</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ['Interfaz web', 'React, TypeScript, Vite y Tailwind CSS.'],
            ['Servicio API', 'Fastify, TypeScript y comprobación de salud.'],
          ].map(([title, description]) => (
            <article key={title} className="rounded-2xl border border-stone-200 bg-white p-6">
              <h3 className="font-semibold text-stone-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-500">{description}</p>
            </article>
          ))}
        </div>
      </section>
      <p className="mt-8 text-xs text-stone-400">No hay módulos de negocio activos en este bootstrap.</p>
    </main>
  );
}

function NotFound() {
  return <main className="mx-auto max-w-6xl px-6 py-16"><h1 className="text-2xl font-semibold">Página no encontrada</h1><NavLink className="mt-4 inline-block text-emerald-800 underline" to="/">Volver al inicio</NavLink></main>;
}

export default function App() {
  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10">
          <NavLink className="flex items-center gap-3" to="/" aria-label="Daplace Rentals, inicio">
            <span className="grid size-9 place-items-center rounded-xl bg-[#183b32] text-sm font-bold text-white">D</span>
            <span className="font-semibold tracking-tight text-stone-900">daplace <span className="font-normal text-stone-500">rentals</span></span>
          </NavLink>
          <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-medium text-stone-600">Base técnica</span>
        </div>
      </header>
      <Routes><Route path="/" element={<Home />} /><Route path="*" element={<NotFound />} /></Routes>
    </div>
  );
}
