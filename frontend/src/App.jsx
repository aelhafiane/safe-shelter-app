import Dashboard from './pages/Dashboard'
import StocksCrudPage from './pages/Stocks'
import UsersPage from './pages/Users'
import ZonesCrudPage from './pages/Zones'
import { useState } from 'react'
import axios from 'axios'
import {
	BrowserRouter,
	Navigate,
	NavLink,
	Outlet,
	Route,
	Routes,
	useLocation,
	useNavigate,
} from 'react-router-dom'
import {
	Boxes,
	LayoutDashboard,
	LogOut,
	MapPinned,
	Users,
} from 'lucide-react'

const navigationItems = [
	{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
	{ to: '/zones', label: 'Zones de Regroupement', icon: MapPinned },
	{ to: '/stocks', label: 'Gestion des Stocks', icon: Boxes },
	{ to: '/users', label: 'Utilisateurs', icon: Users },
]

const AUTH_LOGIN_URL = 'http://localhost:5000/api/auth/login'

function PageShell({ title }) {
	return (
		<section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
			<h1 className="text-3xl font-semibold tracking-tight text-slate-200">{title}</h1>
		</section>
	)
}

function Layout() {
	const navigate = useNavigate()
	const location = useLocation()

	const pageTitleByPath = {
		'/dashboard': 'Dashboard',
		'/zones': 'Zones de Regroupement',
		'/stocks': 'Gestion des Stocks',
		'/users': 'Gestion des Utilisateurs',
	}

	const currentPageTitle = pageTitleByPath[location.pathname] ?? 'Admin Panel'

	const handleLogout = () => {
		localStorage.removeItem('jwt_token')
		navigate('/login', { replace: true })
	}

	return (
		<div className="flex min-h-screen bg-slate-950 text-slate-200">
			<aside className="sticky top-0 h-screen w-64 shrink-0 border-r border-slate-800 bg-slate-900">
				<div className="flex h-16 items-center border-b border-slate-800 px-6">
					<p className="text-sm font-semibold tracking-wide text-slate-100">Safe Shelter Admin</p>
				</div>

				<nav className="space-y-1 p-4">
					{navigationItems.map((item) => {
						const Icon = item.icon

						return (
							<NavLink
								key={item.to}
								to={item.to}
								title={item.label}
								aria-label={item.label}
								className={({ isActive }) =>
									[
										'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200',
										isActive
											? 'border-cyan-500/35 bg-cyan-500/10 text-cyan-300'
											: 'border-transparent text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-100',
									].join(' ')
								}
							>
								<Icon className="h-4 w-4" />
								<span>{item.label}</span>
							</NavLink>
						)
					})}
				</nav>
			</aside>

			<div className="flex min-h-screen flex-1 flex-col bg-slate-950">
				<header className="flex h-16 items-center justify-between border-b border-slate-800 bg-slate-900 px-6">
					<h1 className="text-base font-semibold text-slate-100">{currentPageTitle}</h1>
					<button
						type="button"
						onClick={handleLogout}
						className="inline-flex items-center gap-2 rounded-lg border border-rose-400/35 bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-200 transition-colors duration-200 hover:bg-rose-500/20"
					>
						<LogOut className="h-4 w-4" />
						Logout
					</button>
				</header>

				<main className="flex-1 overflow-y-auto p-6 lg:p-8">
					<Outlet />
				</main>
			</div>
		</div>
	)
}

function ProtectedDashboardRoute({ children }) {
	const token = localStorage.getItem('jwt_token')

	if (!token) {
		return <Navigate to="/login" replace />
	}

	return children
}

function LoginPage() {
	const navigate = useNavigate()
	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [errorMessage, setErrorMessage] = useState('')
	const [loading, setLoading] = useState(false)

	if (localStorage.getItem('jwt_token')) {
		return <Navigate to="/dashboard" replace />
	}

	const handleSubmit = async (event) => {
		event.preventDefault()
		setErrorMessage('')
		setLoading(true)

		try {
			const response = await axios.post(AUTH_LOGIN_URL, {
				email,
				password,
			})
			const token = response?.data?.token

			if (!token) {
				setErrorMessage('Identifiants incorrects. Accès refusé.')
				return
			}

			localStorage.setItem('jwt_token', token)
			navigate('/dashboard', { replace: true })
		} catch (error) {
			if (error?.response?.status === 401) {
				setErrorMessage('Identifiants incorrects. Accès refusé.')
				return
			}

			setErrorMessage('Erreur serveur. Veuillez réessayer.')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-[#0a0f1c] to-black px-4 py-12 text-slate-200">
			<div className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.05] bg-white/[0.02] p-6 shadow-2xl backdrop-blur-xl sm:p-8">
				<p className="text-[11px] uppercase tracking-widest text-slate-400">Safe-Shelter Connect</p>
				<h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-200">
					Connexion Sécurisée
				</h1>
				<p className="mt-2 text-sm text-slate-400">
					Accédez à votre espace de pilotage de crise.
				</p>

				{errorMessage && (
					<div className="mt-5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
						{errorMessage}
					</div>
				)}

				<form className="mt-6 space-y-4" onSubmit={handleSubmit}>
					<div>
						<label className="mb-2 block text-[11px] font-medium uppercase tracking-widest text-slate-400" htmlFor="email">
							Email
						</label>
						<input
							id="email"
							type="email"
							required
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							className="w-full rounded-xl border border-white/[0.08] bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
							placeholder="admin@safe-shelter.ma"
						/>
					</div>

					<div>
						<label className="mb-2 block text-[11px] font-medium uppercase tracking-widest text-slate-400" htmlFor="password">
							Mot de passe
						</label>
						<input
							id="password"
							type="password"
							required
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							className="w-full rounded-xl border border-white/[0.08] bg-slate-950/70 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/50 focus:shadow-[0_0_15px_rgba(6,182,212,0.2)]"
							placeholder="••••••••"
						/>
					</div>

					<button
						type="submit"
						disabled={loading}
						className={[
							'w-full rounded-xl border px-4 py-3 text-sm font-semibold text-white transition-transform duration-200',
							loading
								? 'cursor-not-allowed border-cyan-600/20 bg-cyan-700/30 shadow-none'
								: 'border-cyan-500/30 bg-gradient-to-r from-cyan-600 to-blue-600 shadow-[0_8px_24px_rgba(37,99,235,0.28)] hover:scale-[1.02] hover:shadow-[0_12px_30px_rgba(6,182,212,0.35)]',
						].join(' ')}
					>
						{loading ? 'Connexion...' : 'Se connecter'}
					</button>
				</form>
			</div>
		</div>
	)
}

export default function App() {
	return (
		<BrowserRouter>
			<Routes>
				<Route path="/login" element={<LoginPage />} />
				<Route path="/" element={<Layout />}>
					<Route index element={<Navigate to="/dashboard" replace />} />
					<Route
						path="dashboard"
						element={
							<ProtectedDashboardRoute>
								<Dashboard />
							</ProtectedDashboardRoute>
						}
					/>
					<Route path="zones" element={<ZonesCrudPage />} />
					<Route path="stocks" element={<StocksCrudPage />} />
					<Route path="users" element={<UsersPage />} />
				</Route>
				<Route path="*" element={<Navigate to="/dashboard" replace />} />
			</Routes>
		</BrowserRouter>
	)
}
