import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Crosshair, Edit2, Plus, Trash2, X } from 'lucide-react'
import { MapContainer, Marker, TileLayer, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
	iconRetinaUrl: markerIcon2x,
	iconUrl: markerIcon,
	shadowUrl: markerShadow,
})

const ZONES_API_URL = 'http://localhost:5000/api/zones'
const AGADIR_CENTER = [30.4277, -9.5981]
const MAP_ZOOM = 12
const INITIAL_FORM_DATA = {
	nom: '',
	capacite_max: '',
	latitude: '',
	longitude: '',
	is_hub: false,
}

function parseCoordinate(value) {
	if (value === '' || value === null || value === undefined) {
		return null
	}

	const parsed = Number(value)
	return Number.isFinite(parsed) ? parsed : null
}

function parseHubFlag(value) {
	return (
		value === true ||
		value === 1 ||
		value === '1' ||
		value === 'true' ||
		value === 't'
	)
}

function formatCoordinate(value) {
	const numericValue = Number(value)

	if (!Number.isFinite(numericValue)) {
		return 'Non défini'
	}

	return numericValue.toFixed(6)
}

function MapClickCapture({ markerPosition, onPick }) {
	useMapEvents({
		click(event) {
			const nextLat = Number(event.latlng.lat.toFixed(6))
			const nextLng = Number(event.latlng.lng.toFixed(6))
			onPick(nextLat, nextLng)
		},
	})

	if (!markerPosition) {
		return null
	}

	return <Marker position={markerPosition} />
}

export default function ZonesPage() {
	const [zones, setZones] = useState([])
	const [isModalOpen, setIsModalOpen] = useState(false)
	const [editingZone, setEditingZone] = useState(null)
	const [formData, setFormData] = useState(INITIAL_FORM_DATA)
	const { nom, capacite_max, latitude, longitude, is_hub } = formData
	const [submitting, setSubmitting] = useState(false)

	const updateFormField = useCallback((field, value) => {
		setFormData((prev) => ({ ...prev, [field]: value }))
	}, [])

	const fetchZones = useCallback(async () => {
		try {
			const response = await axios.get(ZONES_API_URL)
			const payload = Array.isArray(response?.data)
				? response.data
				: response?.data?.data

			setZones(Array.isArray(payload) ? payload : [])
		} catch (error) {
			console.error('Failed to fetch zones:', error)
		}
	}, [])

	useEffect(() => {
		fetchZones()
	}, [fetchZones])

	const selectedPosition = useMemo(() => {
		const parsedLat = parseCoordinate(latitude)
		const parsedLng = parseCoordinate(longitude)

		if (parsedLat === null || parsedLng === null) {
			return null
		}

		return [parsedLat, parsedLng]
	}, [latitude, longitude])

	const closeModal = () => {
		setIsModalOpen(false)
		setEditingZone(null)
		setFormData(INITIAL_FORM_DATA)
	}

	const openCreateModal = () => {
		setEditingZone(null)
		setFormData(INITIAL_FORM_DATA)
		setIsModalOpen(true)
	}

	const openEditModal = (zone) => {
		setEditingZone(zone)
		setFormData({
			nom: zone?.nom ?? '',
			capacite_max: String(zone?.capacite_max ?? ''),
			latitude: String(zone?.latitude ?? ''),
			longitude: String(zone?.longitude ?? ''),
			is_hub: parseHubFlag(zone?.is_hub),
		})
		setIsModalOpen(true)
	}

	const buildPayload = () => {
		const parsedLat = parseCoordinate(latitude)
		const parsedLng = parseCoordinate(longitude)

		if (parsedLat === null || parsedLng === null) {
			return null
		}

		return {
			nom: nom.trim(),
			capacite_max: Number(capacite_max),
			latitude: parsedLat,
			longitude: parsedLng,
			is_hub,
		}
	}

	const handleCreate = async () => {
		const payload = buildPayload()
		if (!payload) {
			return
		}

		setSubmitting(true)

		try {
			const response = await axios.post(ZONES_API_URL, payload)
			const createdZone = response?.data?.data ?? response?.data

			if (createdZone && typeof createdZone === 'object') {
				setZones((prevZones) => [createdZone, ...prevZones])
			} else {
				setZones((prevZones) => [
					{
						zone_id: Date.now(),
						occupation_actuelle: 0,
						statut: 'actif',
						is_hub,
						...payload,
					},
					...prevZones,
				])
			}

			closeModal()
		} catch (error) {
			console.error('Failed to creat zone:', error)
		} finally {
			setSubmitting(false)
		}
	}

	const handleUpdate = async () => {
		if (!editingZone) {
			return
		}

		const zoneId = editingZone?.zone_id
		if (!zoneId) {
			return
		}

		const payload = buildPayload()
		if (!payload) {
			return
		}

		setSubmitting(true)

		try {
			const response = await axios.put(`${ZONES_API_URL}/${zoneId}`, payload)
			const updatedZone = response?.data?.data ?? response?.data ?? payload

			setZones((prevZones) =>
				prevZones.map((zone) => {
					const currentId = zone?.zone_id ?? zone?.id_zone ?? zone?.id
					return currentId === zoneId ? { ...zone, ...updatedZone } : zone
				})
			)

			closeModal()
		} catch (error) {
			console.error('Failed to update zone:', error)
		} finally {
			setSubmitting(false)
		}
	}

	const handleDelete = async (zoneId) => {
		if (!zoneId) {
			return
		}

		try {
			await axios.delete(`${ZONES_API_URL}/${zoneId}`)
			await fetchZones()
		} catch (error) {
			console.error('Failed to delete zone:', error)
		}
	}

	const modalTitle = useMemo(
		() => (editingZone ? 'Modifier la Zone' : 'Ajouter une Zone'),
		[editingZone]
	)

	const handleSubmit = async (event) => {
		event.preventDefault()

		if (!nom.trim() || !capacite_max || !selectedPosition) {
			return
		}

		if (editingZone) {
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
						<p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Operations Grid</p>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">
							Gestion des Zones
						</h1>
						<p className="mt-2 text-sm text-slate-400">
							Supervision premium des zones de regroupement avec géolocalisation précise.
						</p>
					</div>

					<button
						type="button"
						onClick={openCreateModal}
						className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_14px_34px_rgba(6,182,212,0.34)]"
					>
						<Plus className="h-4 w-4" />
						Ajouter une Zone
					</button>
				</div>

				<div className="flex-1 overflow-hidden bg-slate-950/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)]">
					<div className="h-full overflow-auto">
						<table className="min-w-full text-left text-sm">
							<thead className="sticky top-0 z-10 bg-slate-900/65 text-xs uppercase tracking-[0.2em] text-slate-300 backdrop-blur-xl">
								<tr>
									<th className="px-6 py-4">ID</th>
									<th className="px-6 py-4">Nom de la Zone</th>
									<th className="px-6 py-4">Capacité Max</th>
									<th className="px-6 py-4">Occupation</th>
									<th className="px-6 py-4">Coordonnées</th>
									<th className="px-6 py-4">Statut</th>
									<th className="px-6 py-4 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{zones.length === 0 && (
									<tr>
										<td colSpan={7} className="px-6 py-20 text-center text-slate-400">
											Aucune zone disponible pour le moment.
										</td>
									</tr>
								)}

								{zones.map((zone) => {
									const zoneId = zone?.zone_id
									const occupation = zone?.occupation_actuelle ?? zone?.occupation ?? 0
									const capacite = zone?.capacite_max ?? 0
									const status = String(zone?.statut ?? 'actif').toLowerCase()
									const isActive = status === 'actif'
									const zoneTypeIsHub = parseHubFlag(zone?.is_hub)

									return (
										<tr
											key={`zone-${zone.zone_id}`}
											className="border-t border-white/10 transition-colors hover:bg-slate-900/50"
										>
											<td className="px-6 py-4 text-slate-300">{zoneId ?? '-'}</td>
											<td className="px-6 py-4 font-medium text-slate-100">
												<div className="inline-flex items-center gap-2">
													<span>{zone?.nom}</span>
													<span
														className={[
															'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
															zoneTypeIsHub
																? 'border-amber-400/45 bg-amber-500/20 text-amber-200'
																: 'border-cyan-400/45 bg-cyan-500/15 text-cyan-200',
														].join(' ')}
													>
														{zoneTypeIsHub ? 'HUB' : 'ZONE'}
													</span>
												</div>
											</td>
											<td className="px-6 py-4 text-slate-300">{capacite}</td>
											<td className="px-6 py-4 text-slate-300">{occupation}</td>
											<td className="px-6 py-4 text-slate-400">
												{formatCoordinate(zone?.latitude)} / {formatCoordinate(zone?.longitude)}
											</td>
											<td className="px-6 py-4">
												<span
													className={[
														'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
														isActive
															? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
															: 'border-rose-400/30 bg-rose-500/15 text-rose-300',
													].join(' ')}
												>
													{isActive ? 'actif' : 'ferme'}
												</span>
											</td>
											<td className="px-6 py-4">
												<div className="flex justify-end gap-2">
													<button
														type="button"
														onClick={() => openEditModal(zone)}
														className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-all duration-200 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200"
														title="Modifier"
													>
														<Edit2 className="h-4 w-4" />
													</button>

													<button
														type="button"
														onClick={() => handleDelete(zone.zone_id)}
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
					<div className="w-full max-w-5xl rounded-3xl border border-white/10 bg-slate-950/65 p-6 shadow-[0_0_45px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
						<div className="mb-6 flex items-center justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Command Editor</p>
								<h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
									{modalTitle}
								</h2>
								<p className="mt-1 text-sm text-slate-400">
									Sélectionnez l'emplacement exact sur la carte puis validez la configuration.
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
									<label htmlFor="zone_nom" className="mb-2 block text-xs uppercase tracking-widest text-slate-400">
										Nom
									</label>
									<input
										id="zone_nom"
										type="text"
										required
										value={nom}
										onChange={(event) => updateFormField('nom', event.target.value)}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
										placeholder="Ex: Zone Nord A"
									/>
								</div>

								<div>
									<label htmlFor="zone_capacite" className="mb-2 block text-xs uppercase tracking-widest text-slate-400">
										Capacité Max
									</label>
									<input
										id="zone_capacite"
										type="number"
										min="0"
										required
										value={capacite_max}
										onChange={(event) => updateFormField('capacite_max', event.target.value)}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
										placeholder="Ex: 350"
									/>
								</div>
							</div>

							<div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
								<label className="inline-flex items-center gap-3 text-sm text-amber-100">
									<input
										type="checkbox"
										checked={is_hub}
										onChange={(event) => updateFormField('is_hub', event.target.checked)}
										className="h-4 w-4 rounded border-amber-300/50 bg-slate-950/80 text-amber-400 focus:ring-amber-400/60"
									/>
									<span className="font-medium">Définir comme Entrepôt Central (Hub)</span>
								</label>
							</div>

							<div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
								<div className="space-y-3">
									<div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2">
										<p className="text-xs uppercase tracking-[0.2em] text-slate-400">Map Picker</p>
										<div className="inline-flex items-center gap-1.5 text-cyan-300">
											<Crosshair className="h-4 w-4" />
											<span className="text-xs">Cliquez pour placer le marqueur</span>
										</div>
									</div>

									<div className="overflow-hidden rounded-2xl border border-white/10">
										<MapContainer
											center={selectedPosition ?? AGADIR_CENTER}
											zoom={MAP_ZOOM}
											scrollWheelZoom
											className="h-[250px] w-full"
										>
											<TileLayer
												attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
												url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
											/>
											<MapClickCapture
												markerPosition={selectedPosition}
												onPick={(pickedLat, pickedLng) => {
													setFormData((prev) => ({
														...prev,
														latitude: String(pickedLat),
														longitude: String(pickedLng),
													}))
												}}
											/>
										</MapContainer>
									</div>
								</div>

								<div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
									<div>
										<label htmlFor="zone_latitude" className="mb-2 block text-xs uppercase tracking-widest text-slate-400">
											Latitude
										</label>
										<input
											id="zone_latitude"
											type="text"
											readOnly
											disabled
											value={latitude ? formatCoordinate(latitude) : ''}
											placeholder="Cliquez sur la carte"
											className="w-full rounded-xl border border-white/10 bg-slate-950/85 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500"
										/>
									</div>

									<div>
										<label htmlFor="zone_longitude" className="mb-2 block text-xs uppercase tracking-widest text-slate-400">
											Longitude
										</label>
										<input
											id="zone_longitude"
											type="text"
											readOnly
											disabled
											value={longitude ? formatCoordinate(longitude) : ''}
											placeholder="Cliquez sur la carte"
											className="w-full rounded-xl border border-white/10 bg-slate-950/85 px-4 py-3 text-sm text-slate-200 placeholder:text-slate-500"
										/>
									</div>

									<p className="rounded-xl border border-white/10 bg-slate-950/65 px-3 py-2 text-xs text-slate-400">
										L'emplacement est obligatoire pour créer ou modifier une zone.
									</p>
								</div>
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
									{submitting
										? 'Traitement...'
										: editingZone
											? 'Enregistrer'
											: 'Créer'}
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</section>
	)
}
