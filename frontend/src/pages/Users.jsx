import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Edit2, Plus, Trash2, X } from 'lucide-react'

const USERS_API_URL = 'http://localhost:5000/api/users'
const ZONES_API_URL = 'http://localhost:5000/api/zones'
const INITIAL_FORM_DATA = {
	utilisateur_id: '',
	nom: '',
	email: '',
	role: 'ADMIN',
	mot_de_passe: '',
	zone_id: '',
}

function normalizeRole(value) {
	return String(value).toUpperCase() === 'MANAGER' ? 'MANAGER' : 'ADMIN'
}

export default function UsersPage() {
	const [users, setUsers] = useState([])
	const [zones, setZones] = useState([])
	const [isModalOpen, setIsModalOpen] = useState(false)
	const [editingUser, setEditingUser] = useState(null)
	const [formData, setFormData] = useState(INITIAL_FORM_DATA)
	const [submitting, setSubmitting] = useState(false)

	const { nom, email, role, mot_de_passe, zone_id } = formData

	const updateFormField = useCallback((field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}, [])

	const fetchUsers = useCallback(async () => {
		try {
			const response = await axios.get(USERS_API_URL)
			setUsers(Array.isArray(response?.data) ? response.data : [])
		} catch (error) {
			console.error('Failed to fetch users:', error)
		}
	}, [])

	const fetchZones = useCallback(async () => {
		try {
			const response = await axios.get(ZONES_API_URL)
			setZones(Array.isArray(response?.data) ? response.data : [])
		} catch (error) {
			console.error('Failed to fetch zones:', error)
		}
	}, [])

	useEffect(() => {
		fetchUsers()
		fetchZones()
	}, [fetchUsers, fetchZones])

	const zonesById = useMemo(() => {
		const map = new Map()

		zones.forEach((zone) => {
			if (zone?.zone_id === undefined || zone?.zone_id === null) {
				return
			}

			map.set(String(zone.zone_id), zone?.nom ?? `Zone #${zone.zone_id}`)
		})

		return map
	}, [zones])

	const closeModal = () => {
		setIsModalOpen(false)
		setEditingUser(null)
		setFormData(INITIAL_FORM_DATA)
	}

	const openCreateModal = () => {
		setEditingUser(null)
		setFormData(INITIAL_FORM_DATA)
		setIsModalOpen(true)
	}

	const openEditModal = (user) => {
		setEditingUser(user)
		setFormData({
			utilisateur_id: user?.utilisateur_id ?? user?.user_id ?? user?.id ?? '',
			nom: user?.nom ?? '',
			email: user?.email ?? '',
			role: normalizeRole(user?.role),
			mot_de_passe: '',
			zone_id: String(user?.zone_id ?? ''),
		})
		setIsModalOpen(true)
	}

	const buildPayload = () => {
		const trimmedNom = nom.trim()
		const trimmedEmail = email.trim()
		const normalizedRole = normalizeRole(role)
		const requiresZone = normalizedRole === 'MANAGER'

		if (!trimmedNom || !trimmedEmail || !normalizedRole || (requiresZone && !zone_id)) {
			return null
		}

		return {
			nom: trimmedNom,
			email: trimmedEmail,
			role: normalizedRole,
			zone_id: normalizedRole === 'ADMIN' || zone_id === '' ? '' : Number(zone_id),
		}
	}

	const handleCreate = async () => {
		const payload = buildPayload()
		const passwordValue = String(mot_de_passe || '').trim()

		if (!payload || !passwordValue) {
			return
		}

		setSubmitting(true)

		try {
			await axios.post(USERS_API_URL, {
				...payload,
				mot_de_passe: passwordValue,
			})
			await fetchUsers()
			closeModal()
		} catch (error) {
			console.error('Failed to create user:', error)
		} finally {
			setSubmitting(false)
		}
	}

	const handleUpdate = async () => {
		console.log('🛠️ Attempting Update. FormData:', formData)
		if (!formData.utilisateur_id) {
			console.warn('Update aborted: missing utilisateur_id.')
			return
		}

		const payload = buildPayload()
		if (!payload) {
			console.warn('Update aborted: invalid payload.', payload)
			return
		}

		setSubmitting(true)

		try {
			const passwordValue = String(mot_de_passe || '').trim()
			const updatePayload = {
				...payload,
				...(passwordValue ? { mot_de_passe: passwordValue } : {}),
			}

			await axios.put(`${USERS_API_URL}/${formData.utilisateur_id}`, updatePayload)
			await fetchUsers()
			closeModal()
		} catch (err) {
			console.error('❌ Update failed:', err)
		} finally {
			setSubmitting(false)
		}
	}

	const handleDelete = async (userId) => {
		if (!userId) {
			return
		}

		try {
			await axios.delete(`${USERS_API_URL}/${userId}`)
			await fetchUsers()
		} catch (error) {
			console.error('Failed to delete user:', error)
		}
	}

	const modalTitle = useMemo(
		() => (editingUser ? 'Modifier utilisateur' : 'Ajouter utilisateur'),
		[editingUser]
	)

	const handleSubmit = async (event) => {
		event.preventDefault()

		if (editingUser) {
			await handleUpdate()
			return
		}

		await handleCreate()
	}

	return (
		<section className="flex h-full w-full flex-col gap-6 bg-transparent">
			<div className="flex h-full flex-col gap-6">
				<div className="flex flex-wrap items-start justify-between gap-4">
					<div>
						<p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Access Control</p>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">
							Gestion des utilisateurs
						</h1>
						<p className="mt-2 text-sm text-slate-400">
							Gestion securisee des roles et des affectations zones.
						</p>
					</div>

					<button
						type="button"
						onClick={openCreateModal}
						className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_14px_34px_rgba(6,182,212,0.34)]"
					>
						<Plus className="h-4 w-4" />
						Ajouter un utilisateur
					</button>
				</div>

				<div className="flex-1 overflow-hidden bg-slate-950/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)]">
					<div className="h-full overflow-auto">
						<table className="min-w-full text-left text-sm">
							<thead className="sticky top-0 z-10 bg-slate-900/65 text-xs uppercase tracking-[0.2em] text-slate-300 backdrop-blur-xl">
								<tr>
									<th className="px-6 py-4">Nom</th>
									<th className="px-6 py-4">Email</th>
									<th className="px-6 py-4">Role</th>
									<th className="px-6 py-4">Zone assignee</th>
									<th className="px-6 py-4 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{users.length === 0 && (
									<tr>
										<td colSpan={5} className="px-6 py-20 text-center text-slate-400">
											Aucun utilisateur disponible pour le moment.
										</td>
									</tr>
								)}

								{users.map((user) => {
									const roleValue = normalizeRole(user?.role)
									const isAdmin = roleValue === 'ADMIN'
									const zoneName =
										user?.zone_nom ??
										zonesById.get(String(user?.zone_id)) ??
										'Zone non assignee'

									return (
										<tr
											key={`user-${user.user_id}`}
											className="border-t border-white/10 transition-colors hover:bg-slate-900/50"
										>
											<td className="px-6 py-4 font-medium text-slate-100">
												{user?.nom}
											</td>
											<td className="px-6 py-4 text-slate-300">{user?.email}</td>
											<td className="px-6 py-4">
												<span
													className={[
														'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
														isAdmin
															? 'border-amber-400/30 bg-amber-500/15 text-amber-200'
															: 'border-cyan-400/30 bg-cyan-500/15 text-cyan-200',
													].join(' ')}
												>
													{roleValue}
												</span>
											</td>
											<td className="px-6 py-4 text-slate-300">{zoneName}</td>
											<td className="px-6 py-4">
												<div className="flex justify-end gap-2">
													<button
														type="button"
														onClick={() => openEditModal(user)}
														className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-all duration-200 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200"
														title="Editer"
													>
														<Edit2 className="h-4 w-4" />
													</button>

													<button
														type="button"
														onClick={() => handleDelete(user.user_id)}
														className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-all duration-200 hover:border-rose-400/40 hover:bg-rose-500/10 hover:text-rose-300"
														title="Supprimer"
													>
														<Trash2 className="h-4 w-4" />
													</button>
												</div>
											</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				</div>
			</div>

			{isModalOpen && (
				<div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex items-center justify-center px-4 py-6">
					<div className="w-full max-w-4xl rounded-3xl border border-white/10 bg-slate-950/65 p-6 shadow-[0_0_45px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
						<div className="mb-6 flex items-center justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">User Console</p>
								<h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
									{modalTitle}
								</h2>
								<p className="mt-1 text-sm text-slate-400">
									Configurer les acces et la zone assignee.
								</p>
							</div>

							<button
								type="button"
								onClick={closeModal}
								className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition hover:bg-white/[0.09]"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						<form className="space-y-5" onSubmit={handleSubmit}>
							<div className="grid gap-4 md:grid-cols-2">
								<div>
									<label
										htmlFor="user_nom"
										className="mb-2 block text-xs uppercase tracking-widest text-slate-400"
									>
										Nom
									</label>
									<input
										id="user_nom"
										type="text"
										required
										value={nom}
										onChange={(event) => updateFormField('nom', event.target.value)}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
										placeholder="Nom complet"
									/>
								</div>

								<div>
									<label
										htmlFor="user_email"
										className="mb-2 block text-xs uppercase tracking-widest text-slate-400"
									>
										Email
									</label>
									<input
										id="user_email"
										type="email"
										required
										value={email}
										onChange={(event) => updateFormField('email', event.target.value)}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
										placeholder="user@safe-shelter.ma"
									/>
								</div>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div>
									<label
										htmlFor="user_role"
										className="mb-2 block text-xs uppercase tracking-widest text-slate-400"
									>
										Role
									</label>
									<select
										id="user_role"
										required
										value={role}
										onChange={(event) => {
											const nextRole = event.target.value
											updateFormField('role', nextRole)
											if (normalizeRole(nextRole) === 'ADMIN') {
												updateFormField('zone_id', '')
											}
										}}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
									>
										<option value="ADMIN">Admin</option>
										<option value="MANAGER">Manager</option>
									</select>
								</div>

								<div>
									<label
										htmlFor="user_zone"
										className="mb-2 block text-xs uppercase tracking-widest text-slate-400"
									>
										Zone assignee
									</label>
									<select
										id="user_zone"
										required
										value={zone_id}
										onChange={(event) => updateFormField('zone_id', event.target.value)}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
										disabled={zones.length === 0 || normalizeRole(role) === 'ADMIN'}
									>
										<option value="">-- Aucune zone (Admin/Global) --</option>
										{zones.length === 0 ? (
											<option value="" disabled>
												Aucune zone disponible
											</option>
										) : (
											zones.map((zone) => (
												<option key={`zone-${zone.zone_id}`} value={String(zone.zone_id)}>
													{zone?.nom ?? `Zone #${zone.zone_id}`}
												</option>
											))
										)}
									</select>
								</div>
							</div>

							<div>
								<label
									htmlFor="user_password"
									className="mb-2 block text-xs uppercase tracking-widest text-slate-400"
								>
									Password
								</label>
								<input
									id="user_password"
									type="password"
									required={!editingUser}
									value={mot_de_passe}
									onChange={(event) => updateFormField('mot_de_passe', event.target.value)}
									className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
									placeholder={editingUser ? 'Laisser vide pour conserver' : 'Mot de passe'}
								/>
							</div>

							<div className="flex justify-end gap-3 pt-1">
								<button
									type="button"
									onClick={closeModal}
									className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/[0.1]"
								>
									Annuler
								</button>

								<button
									type="submit"
									disabled={submitting}
									className="rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)] transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_14px_34px_rgba(6,182,212,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
								>
									{submitting ? 'Traitement...' : editingUser ? 'Enregistrer' : 'Creer'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</section>
	)
}
