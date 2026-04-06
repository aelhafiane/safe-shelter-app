


import { useCallback, useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import {
	Activity,
	AlertTriangle,
	Boxes,
	ShieldCheck,
	Truck,
} from 'lucide-react'
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const RISKS_API_URL = 'http://localhost:5000/api/risks'
const STOCKS_API_URL = 'http://localhost:5000/api/stocks'
const DISTRIBUTION_API_URL = 'http://localhost:5000/api/distributions'
const DISPATCH_API_URL = 'http://localhost:5000/api/dispatch'
const ACTIVITY_LOGS_API_URL = 'http://localhost:5000/api/activity-logs'
const AGADIR_CENTER = [30.4277, -9.5981]
const AGADIR_ZOOM = 12
const REFRESH_INTERVAL_MS = 10000

const hubIcon = new L.DivIcon({
	className: 'custom-hub-icon',
	html: `<div class=\"grid h-8 w-8 place-items-center rounded-full bg-amber-500/20 border border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.5)]\"><div class=\"h-3 w-3 rounded-full bg-amber-400 animate-pulse\"></div></div>`,
	iconSize: [32, 32],
	iconAnchor: [16, 16],
})
const HEATMAP_START = { r: 34, g: 211, b: 238 }
const HEATMAP_END = { r: 248, g: 113, b: 113 }

function clampValue(value, min, max) {
	return Math.min(max, Math.max(min, value))
}

function getZoneLoadRatio(zone) {
	const capacity = Number(zone?.capacite_max) || 0
	const occupation = Number(zone?.occupation_actuelle) || 0

	if (capacity <= 0) {
		return 0
	}

	return clampValue(occupation / capacity, 0, 1)
}

function interpolateColor(start, end, ratio) {
	const t = clampValue(ratio, 0, 1)
	const r = Math.round(start.r + (end.r - start.r) * t)
	const g = Math.round(start.g + (end.g - start.g) * t)
	const b = Math.round(start.b + (end.b - start.b) * t)

	return `rgb(${r}, ${g}, ${b})`
}

function getHeatColor(ratio) {
	return interpolateColor(HEATMAP_START, HEATMAP_END, ratio)
}

function getHeatRadius(ratio) {
	return 8 + ratio * 12
}

function formatLogTime(value) {
	const parsedDate = new Date(value)

	if (Number.isNaN(parsedDate.getTime())) {
		return '--:--'
	}

	return parsedDate.toLocaleTimeString('fr-FR', {
		hour: '2-digit',
		minute: '2-digit',
	})
}

function isHubZone(zone) {
	const hubFlag = zone?.is_hub

	return (
		hubFlag === true ||
		hubFlag === 1 ||
		hubFlag === '1' ||
		hubFlag === 'true' ||
		hubFlag === 't'
	)
}

function formatRiskValue(value) {
	const numericValue = Number(value)
	return Number.isFinite(numericValue) ? numericValue.toFixed(2) : 'N/A'
}

function formatResourceName(resource = '') {
	return String(resource)
		.split('_')
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ')
}

export default function DashboardPage() {
	const [risks, setRisks] = useState([])
	const [stocks, setStocks] = useState([])
	const [activityLogs, setActivityLogs] = useState([])
	const [loading, setLoading] = useState(true)
	const [dispatchLoading, setDispatchLoading] = useState(false)
	const [dispatchLog, setDispatchLog] = useState('Standby: Fleet deployment terminal ready.')
	const [dispatchSuccess, setDispatchSuccess] = useState(false)
	const [selectedResource, setSelectedResource] = useState('eau')
	const [targetZoneId, setTargetZoneId] = useState('')
	const [dispatchQty, setDispatchQty] = useState(50)
	const [activePath, setActivePath] = useState(null)

	const fetchDashboardData = useCallback(async () => {
		try {
			const [risksResponse, stocksResponse, activityLogsResponse] = await Promise.all([
				axios.get(RISKS_API_URL),
				axios.get(STOCKS_API_URL),
				axios.get(ACTIVITY_LOGS_API_URL),
			])

			const risksPayload = Array.isArray(risksResponse?.data)
				? risksResponse.data
				: []
			const stocksPayload = Array.isArray(stocksResponse?.data)
				? stocksResponse.data
				: []
			const activityPayload = Array.isArray(activityLogsResponse?.data)
				? activityLogsResponse.data
				: []

			setRisks(risksPayload)
			setStocks(stocksPayload)
			setActivityLogs(activityPayload)
		} catch (error) {
			console.error('Dashboard data fetch failed:', error)
			setRisks([])
			setStocks([])
			setActivityLogs([])
		}
	}, [])

	useEffect(() => {
		let isMounted = true

		const initialLoad = async () => {
			await fetchDashboardData()
			if (isMounted) {
				setLoading(false)
			}
		}

		initialLoad()
		const refreshInterval = window.setInterval(fetchDashboardData, REFRESH_INTERVAL_MS)

		return () => {
			isMounted = false
			window.clearInterval(refreshInterval)
		}
	}, [fetchDashboardData])

	const markerZones = useMemo(() => {
		return risks
			.filter(
				(zone) =>
					zone?.zone_id !== null &&
					zone?.zone_id !== undefined &&
					zone?.latitude !== null &&
					zone?.latitude !== undefined &&
					zone?.longitude !== null &&
					zone?.longitude !== undefined
			)
			.map((zone) => ({
				...zone,
				lat: Number(zone.latitude),
				lng: Number(zone.longitude),
			}))
			.filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lng))
	}, [risks])

	const centralHub = useMemo(() => {
		return risks.find((risk) => isHubZone(risk)) ?? null
	}, [risks])

	const dispatchTargetZones = useMemo(() => {
		return risks.filter((zone) => {
			if (isHubZone(zone)) {
				return false
			}

			return zone?.zone_id !== undefined && zone?.zone_id !== null
		})
	}, [risks])

	const targetZones = dispatchTargetZones

	const zoneCoordinatesById = useMemo(() => {
		const coordinatesMap = new Map()

		markerZones.forEach((zone) => {
			if (zone?.zone_id === undefined || zone?.zone_id === null) {
				return
			}

			coordinatesMap.set(String(zone.zone_id), {
				lat: zone.lat,
				lng: zone.lng,
			})
		})

		return coordinatesMap
	}, [markerZones])

	const criticalRiskZones = useMemo(() => {
		return risks.filter((zone) => Number(zone?.risque_penurie) >= 80)
	}, [risks])

	const maxQuantity = useMemo(() => {
		const quantities = stocks.map((stock) => Number(stock?.quantite_disponible) || 0)
		return Math.max(...quantities, 1)
	}, [stocks])

	const capacitySnapshot = useMemo(() => {
		const totalOccupation =
			targetZones?.reduce(
				(sum, zone) => sum + (Number(zone.occupation_actuelle) || 0),
				0
			) || 0
		const totalCapacity =
			targetZones?.reduce(
				(sum, zone) => sum + (Number(zone.capacite_max) || 0),
				0
			) || 0
		const fillPercentage =
			totalCapacity > 0
				? ((totalOccupation / totalCapacity) * 100).toFixed(1)
				: 0

		return { totalOccupation, totalCapacity, fillPercentage }
	}, [risks, targetZones])

	const criticalOccupancyZones = useMemo(() => {
		return dispatchTargetZones.filter((zone) => getZoneLoadRatio(zone) >= 0.9)
	}, [dispatchTargetZones])

	const standardZones = useMemo(() => {
		return risks.filter((zone) => !isHubZone(zone))
	}, [risks])

	const hubMarkerZones = useMemo(() => {
		return markerZones.filter((zone) => isHubZone(zone))
	}, [markerZones])

	const standardMarkerZones = useMemo(() => {
		return markerZones.filter((zone) => !isHubZone(zone))
	}, [markerZones])

	const burnRateReport = useMemo(() => {
		return standardZones.map((zone) => {
			const occupation = Number(zone?.occupation_actuelle) || 0
			const waterQuantity = stocks
				.filter(
					(stock) =>
						String(stock?.zone_id) === String(zone?.zone_id) &&
						String(stock?.type_ressource) === 'eau'
				)
				.reduce(
					(sum, stock) => sum + (Number(stock?.quantite_disponible) || 0),
					0
				)
			const hasOccupation = occupation > 0
			const daysLeft = hasOccupation
				? Math.floor(waterQuantity / (occupation * 2))
				: null
			const statusLabel = hasOccupation
				? null
				: 'Risque faible (Occupation nulle)'

			return {
				zone,
				waterQuantity,
				occupation,
				daysLeft,
				statusLabel,
			}
		})
	}, [standardZones, stocks])

	const hubStatusValue = dispatchTargetZones.length > 0
		? dispatchTargetZones.length
		: 'Online'
	const hubStatusLabel = dispatchTargetZones.length > 0 ? 'zones' : 'Status'

	useEffect(() => {
		if (dispatchTargetZones.length === 0) {
			setTargetZoneId('')
			return
		}

		const selectedExists = dispatchTargetZones.some(
			(zone) => String(zone?.zone_id) === String(targetZoneId)
		)

		if (!selectedExists) {
			setTargetZoneId(String(dispatchTargetZones[0]?.zone_id ?? ''))
		}
	}, [dispatchTargetZones, targetZoneId])

	const handleFleetDispatch = async (event) => {
		event.preventDefault()

		const parsedHubId = Number(centralHub?.zone_id)
		const parsedTargetZoneId = parseInt(targetZoneId, 10)
		const parsedQty = parseInt(String(dispatchQty), 10)

		if (!Number.isInteger(parsedHubId) || parsedHubId <= 0) {
			setDispatchSuccess(false)
			setDispatchLog('Hub non detecte: verifiez le flag is_hub sur une zone.')
			return
		}

		if (!Number.isInteger(parsedTargetZoneId) || parsedTargetZoneId <= 0) {
			setDispatchSuccess(false)
			setDispatchLog('Cible invalide: selectionnez une zone de crise valide.')
			return
		}

		if (!selectedResource) {
			setDispatchSuccess(false)
			setDispatchLog('Ressource invalide: selectionnez un type de ressource.')
			return
		}

		if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
			setDispatchSuccess(false)
			setDispatchLog('Quantite invalide: entrez une valeur numerique positive.')
			return
		}

		setDispatchLoading(true)
		setDispatchSuccess(false)
		setDispatchLog('Dossier recu: calcul de trajectoire logistique en cours...')

		try {
			await axios.post(DISPATCH_API_URL, {
				hub_id: parsedHubId,
				zone_id: parsedTargetZoneId,
				type_ressource: selectedResource,
				quantite: parsedQty,
			})

			const targetZone = dispatchTargetZones.find(
				(zone) => Number(zone?.zone_id) === parsedTargetZoneId
			)
			const targetLabel = targetZone?.nom ?? `Zone #${parsedTargetZoneId}`

			setDispatchSuccess(true)
			setDispatchLog(
				`Deploiement confirme: ${formatResourceName(selectedResource)} x${parsedQty} vers ${targetLabel}.`
			)

			const startCoordinates = zoneCoordinatesById.get(String(parsedHubId))
			const endCoordinates = zoneCoordinatesById.get(String(parsedTargetZoneId))

			if (startCoordinates && endCoordinates) {
				setActivePath({
					start: [startCoordinates.lat, startCoordinates.lng],
					end: [endCoordinates.lat, endCoordinates.lng],
				})
			}

			window.setTimeout(() => {
				setActivePath(null)
				fetchDashboardData()
			}, 4000)

		} catch (error) {
			console.error('Fleet dispatch failed:', error)
			setDispatchSuccess(false)
			setDispatchLog('Dispatch echec: verifier les donnees et les journaux backend.')
		} finally {
			setDispatchLoading(false)
		}
	}

	return (
		<div className="flex flex-col gap-6 text-slate-100">
			<section className="grid gap-4 md:grid-cols-3">
				<article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
					<p className="text-xs uppercase tracking-widest text-slate-400">Capacite Globale</p>
					<div className="mt-3 flex items-end justify-between">
						<p className="text-2xl font-semibold text-slate-100">
							{capacitySnapshot.totalOccupation} / {capacitySnapshot.totalCapacity}
						</p>
						<span className="text-xs font-semibold text-cyan-300">
							{capacitySnapshot.fillPercentage}%
						</span>
					</div>
					<div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
						<div
							className="h-full rounded-full bg-cyan-400"
							style={{
								width: `${Math.min(
									100,
									Math.max(2, Number(capacitySnapshot.fillPercentage))
								)}%`,
							}}
						/>
					</div>
					<p className="mt-2 text-xs text-slate-400">
						Occupation consolidee sur l'ensemble des zones.
					</p>
				</article>

				<article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
					<p className="text-xs uppercase tracking-widest text-slate-400">Etat Hub Central</p>
					<div className="mt-3 flex items-end justify-between">
						<p className="text-2xl font-semibold text-amber-200">{hubStatusValue}</p>
						<span className="text-xs text-slate-400">{hubStatusLabel}</span>
					</div>
					<p className="mt-2 text-xs text-slate-400">Articles en stock centralises.</p>
					<div className="mt-3 flex items-center gap-2 text-xs text-amber-300">
						<span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
						Supervision temps reel active.
					</div>
				</article>

				<article className="rounded-xl border border-slate-800 bg-slate-900 p-4">
					<p className="text-xs uppercase tracking-widest text-slate-400">Zones Critiques</p>
					<div className="mt-3 flex items-end justify-between">
						<p className="text-2xl font-semibold text-rose-200">
							{criticalOccupancyZones.length}
						</p>
						<span className="text-xs text-rose-300">&gt; 90%</span>
					</div>
					<p className="mt-2 text-xs text-slate-400">Occupation superieure au seuil.</p>
				</article>
			</section>

			<section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
					<div className="mb-4 flex items-center justify-between">
						<div>
							<p className="text-xs uppercase tracking-widest text-slate-400">Decision Support Map</p>
							<h2 className="text-lg font-semibold text-slate-100">Zones de Regroupement</h2>
						</div>
						<p className="text-sm text-slate-400">{markerZones.length} zones geolocalisees</p>
					</div>

					<MapContainer
						center={AGADIR_CENTER}
						zoom={AGADIR_ZOOM}
						scrollWheelZoom
						className="h-[380px] w-full rounded-lg"
					>
						<TileLayer
							attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
							url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
						/>

						{activePath?.start && activePath?.end && (
							<Polyline
								key={Date.now()}
								positions={[activePath.start, activePath.end]}
								pathOptions={{ dashArray: '10, 15', color: '#22d3ee', weight: 3 }}
								className="animate-ant-path"
							/>
						)}

						{hubMarkerZones.map((zone) => (
							<Marker
								key={`hub-${zone.zone_id}`}
								position={[zone.lat, zone.lng]}
								icon={hubIcon}
							>
								<Popup>
									<div className="space-y-1">
										<p className="font-semibold text-slate-900">{zone?.nom ?? 'Central Hub'}</p>
										<p className="text-xs font-medium uppercase tracking-wider text-slate-600">
											Central Hub
										</p>
										<p className="text-sm text-slate-700">
											Risk Index: {formatRiskValue(zone?.risque_penurie)}
										</p>
									</div>
								</Popup>
							</Marker>
						))}

						{standardMarkerZones.map((zone) => {
							const loadRatio = getZoneLoadRatio(zone)
							const heatColor = getHeatColor(loadRatio)
							const radius = getHeatRadius(loadRatio)
							const occupation = Number(zone?.occupation_actuelle) || 0
							const capacity = Number(zone?.capacite_max) || 0
							const loadPercent = Math.round(loadRatio * 100)

							return (
								<CircleMarker
									key={`zone-${zone.zone_id}`}
									center={[zone.lat, zone.lng]}
									radius={radius}
									pathOptions={{
										color: heatColor,
										fillColor: heatColor,
										fillOpacity: 0.5,
										weight: 2,
									}}
								>
									<Popup>
										<div className="space-y-1">
											<p className="font-semibold text-slate-900">{zone?.nom ?? 'Unknown Zone'}</p>
											<p className="text-xs font-medium uppercase tracking-wider text-slate-600">
												Crisis Zone
											</p>
											<p className="text-sm text-slate-700">
												Occupation: {occupation} / {capacity}
											</p>
											<p className="text-sm text-slate-700">Charge: {loadPercent}%</p>
										</div>
									</Popup>
								</CircleMarker>
							)
						})}
					</MapContainer>

					<div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4">
						<div className="flex items-center justify-between">
							<div>
								<p className="text-xs uppercase tracking-widest text-slate-400">Burn Rate AI</p>
								<h3 className="mt-1 text-sm font-semibold text-slate-100">
									Predictions de rupture d'eau
								</h3>
							</div>
							<span className="text-xs text-cyan-300">Model v1.0</span>
						</div>
						<div className="mt-3 space-y-2">
							{burnRateReport.length === 0 ? (
								<div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs text-slate-400">
									Aucune zone standard disponible pour l'analyse.
								</div>
							) : (
								burnRateReport.map((entry) => {
									const zoneLabel =
										entry.zone?.nom ?? `Zone #${entry.zone?.zone_id ?? '?'}`
									const daysLabel = entry.daysLeft !== null ? entry.daysLeft : 'N/A'
									const warningMessage = entry.statusLabel
										? `🚨 ${zoneLabel}: ${entry.statusLabel}.`
										: `🚨 ${zoneLabel}: Rupture d'eau estimee dans ${daysLabel} jours.`

									return (
										<div
											key={`burn-${entry.zone?.zone_id}`}
											className="rounded-lg border border-slate-800 bg-slate-900/70 p-3"
										>
											<p className="text-sm text-slate-200">{warningMessage}</p>
											<p className="mt-1 text-xs text-slate-500">
												Stock eau: {entry.waterQuantity} u | Occupation: {entry.occupation}
											</p>
										</div>
									)
								})
							)}
						</div>
					</div>
				</div>

				<aside className="rounded-xl border border-slate-800 bg-slate-900 p-4 flex flex-col">
					<div className="flex items-center justify-between">
						<div>
							<p className="text-xs uppercase tracking-widest text-slate-400">Activity Log</p>
							<h3 className="mt-1 text-sm font-semibold text-slate-100">ACTIVITY LOG</h3>
						</div>
						<span className="text-xs text-emerald-300">Live</span>
					</div>
					<div className="mt-4 max-h-[520px] space-y-3 overflow-y-auto font-mono text-xs">
						{activityLogs.map((log) => {
							const logId = log?.log_id ?? log?.id ?? log?.activity_log_id ?? log?.action_time

							return (
								<div
									key={`log-${logId}`}
									className="rounded-lg border border-slate-800 bg-slate-950/80 p-3 text-slate-300"
								>
									<p className="text-[11px] uppercase tracking-widest text-slate-500">
										{formatLogTime(log?.action_time)}
									</p>
									<p className="mt-1 text-xs text-slate-200">{log?.message}</p>
								</div>
							)
						})}
					</div>
				</aside>
			</section>

			<section className="grid grid-cols-2 gap-6">
				<article className="rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-xs uppercase tracking-widest text-slate-400">Niveaux de Stocks</p>
							<h2 className="mt-1 text-lg font-semibold text-slate-100">Ressources par Zone</h2>
						</div>
						<div className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-cyan-300">
							<Boxes className="h-4 w-4" />
						</div>
					</div>

					<div className="mt-4 space-y-4">
						{loading && (
							<div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
								<div className="flex items-center gap-2 text-cyan-300">
									<Activity className="h-4 w-4 animate-pulse" />
									Chargement des stocks...
								</div>
							</div>
						)}

						{!loading && stocks.length === 0 && (
							<div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
								Aucun stock disponible.
							</div>
						)}

						{!loading && risks.length === 0 && (
							<div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
								Aucune zone disponible.
							</div>
						)}

						{risks.map((zone, zoneIndex) => {
							const strictZoneStocks = stocks.filter(
								(s) => s?.zone_id === zone?.zone_id
							)
							const zoneStocks =
								strictZoneStocks.length > 0
									? strictZoneStocks
									: stocks.filter(
											(s) => Number(s?.zone_id) === Number(zone?.zone_id)
									  )
							const criticalStocks = zoneStocks.filter((stock) => {
								const quantity = Number(stock?.quantite_disponible)
								const threshold = Number(stock?.seuil_alerte)

								if (!Number.isFinite(quantity) || !Number.isFinite(threshold)) {
									return false
								}

								return quantity <= threshold
							})

							const zoneLabel = zone?.nom?.trim() || `Zone #${zone?.zone_id ?? '?'}`

							return (
								<div
									key={`zone-stock-group-${zone.zone_id}`}
									className={[
										'space-y-3',
										zoneIndex < risks.length - 1
											? 'border-b border-slate-800 pb-4'
											: '',
									].join(' ')}
								>
									<p className="text-xs font-semibold uppercase tracking-widest text-slate-300">
										{zoneLabel}
									</p>

									{zoneStocks.length === 0 ? (
										<div className="text-xs text-slate-500 italic p-4 border border-dashed border-slate-700/50 rounded-lg">
											🚨 ZONE NON ÉQUIPÉE: Déploiement initial d'urgence requis (Eau, Tentes, Kits).
										</div>
									) : (
										<>
											{zoneStocks.map((stock) => {
												const quantity = Number(stock?.quantite_disponible) || 0
												const threshold = Number(stock?.seuil_alerte) || 0
												const isLow = quantity <= threshold
												const meterPercent = Math.min(
													100,
													Math.max(2, (quantity / maxQuantity) * 100)
												)

												return (
													<div
														key={stock.stock_id}
														className="rounded-lg border border-slate-700 bg-slate-950 p-3"
													>
														<div className="flex items-start justify-between gap-3">
															<p className="text-sm font-semibold text-slate-100">
																{formatResourceName(stock?.type_ressource)}
															</p>
															<p className="text-sm font-semibold text-slate-200">
																{quantity} u
															</p>
														</div>

														<div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-800">
															<div
																className={[
																	'h-full transition-all duration-300',
																	isLow ? 'bg-rose-500' : 'bg-cyan-400',
																].join(' ')}
																style={{ width: `${meterPercent}%` }}
															/>
														</div>

														<p
															className={[
																'mt-2 text-xs uppercase tracking-widest',
																isLow ? 'text-rose-300' : 'text-cyan-300',
															].join(' ')}
														>
															Seuil: {threshold} | {isLow ? 'Critical Reserve' : 'Operational'}
														</p>
													</div>
												)
											})}

											{criticalStocks.length > 0 && (
												<div className="bg-rose-500/10 border border-rose-500/30 rounded-lg p-3 mt-3 animate-pulse space-y-2">
													{criticalStocks.map((stock) => {
														const quantity = Number(stock?.quantite_disponible) || 0
														const threshold = Number(stock?.seuil_alerte) || 0
														const requiredAmount = Math.max(
															0,
															(threshold - quantity) + Math.floor(threshold * 0.2)
														)

														return (
															<p
																key={`action-${stock.stock_id}`}
																className="text-xs font-semibold uppercase tracking-widest text-rose-200"
															>
																🚨 DÉPLOIEMENT REQUIS: Envoyer +{requiredAmount} unités de {formatResourceName(stock?.type_ressource)}.
															</p>
														)
													})}
												</div>
											)}
										</>
									)}
								</div>
							)
						})}
					</div>
				</article>

				<article className="rounded-xl border border-slate-800 bg-slate-900 p-5">
					<div className="flex items-start justify-between gap-3">
						<div>
							<p className="text-xs uppercase tracking-widest text-slate-400">Risk & Dispatch</p>
							<h2 className="mt-1 text-lg font-semibold text-slate-100">Deploiement de Flotte</h2>
						</div>
						<div className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-rose-300">
							<AlertTriangle className="h-4 w-4" />
						</div>
					</div>

					<div className="mt-4 space-y-3">
						{loading && (
							<div className="rounded-lg border border-slate-700 bg-slate-950 p-3 text-sm text-slate-300">
								Chargement des niveaux de risque...
							</div>
						)}

						{!loading && criticalRiskZones.length === 0 && (
							<div className="rounded-lg border border-cyan-500/40 bg-cyan-950/30 p-3 text-sm text-cyan-200">
								Toutes les zones sont actuellement stables.
							</div>
						)}

						{criticalRiskZones.map((zone) => (
							<div
								key={`critical-${zone.zone_id}`}
								className="rounded-lg border border-rose-500/45 bg-rose-950/30 p-3"
							>
								<div className="flex items-start justify-between gap-3">
									<div>
										<p className="text-sm font-semibold text-slate-100">
											{zone?.nom ?? 'Unknown Zone'}
										</p>
										<p className="mt-1 text-xs uppercase tracking-widest text-rose-300">
											Indice de Risque: {formatRiskValue(zone?.risque_penurie)}
										</p>
									</div>
									<AlertTriangle className="h-4 w-4 flex-shrink-0 text-rose-300" />
								</div>
							</div>
						))}
					</div>

					<form
						className="mt-6 rounded-lg border border-slate-700 bg-slate-950 p-4"
						onSubmit={handleFleetDispatch}
					>
						<p className="text-xs uppercase tracking-widest text-slate-400">Deploiement de Flotte</p>
						<p className={[
							'mt-2 text-sm',
							dispatchSuccess ? 'text-cyan-300' : 'text-slate-300',
						].join(' ')}>
							{dispatchLog}
						</p>

						<div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
							<select
								value={selectedResource}
								onChange={(event) => setSelectedResource(event.target.value)}
								className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-500/50"
								disabled={dispatchLoading}
							>
								<option value="eau">Eau</option>
								<option value="tente">Tente</option>
								<option value="kit_medical">Kit Medical</option>
							</select>

							<select
								value={targetZoneId}
								onChange={(event) => setTargetZoneId(event.target.value)}
								className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-500/50"
								disabled={dispatchLoading || dispatchTargetZones.length === 0}
							>
								{dispatchTargetZones.length === 0 ? (
									<option value="">Aucune zone cible disponible</option>
								) : (
									dispatchTargetZones.map((zone) => (
										<option
											key={`zone-${zone.zone_id}`}
											value={String(zone?.zone_id ?? '')}
										>
											{zone?.nom ?? `Zone #${zone?.zone_id ?? '?'}`}
										</option>
									))
								)}
							</select>

							<input
								type="number"
								min={1}
								step={1}
								value={dispatchQty}
								onChange={(event) => {
									const parsedValue = parseInt(event.target.value, 10)
									setDispatchQty(Number.isInteger(parsedValue) ? parsedValue : 0)
								}}
								className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none transition focus:border-cyan-500/50"
								disabled={dispatchLoading}
							/>
						</div>

						{!centralHub?.zone_id && (
							<div className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
								Hub central introuvable: definir is_hub=true sur la zone entrepot.
							</div>
						)}

						<button
							type="submit"
							disabled={dispatchLoading || !targetZoneId || !centralHub?.zone_id}
							className={[
								'mt-4 inline-flex items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold',
								dispatchLoading || !targetZoneId || !centralHub?.zone_id
									? 'cursor-not-allowed border-slate-700 bg-slate-800 text-slate-400'
									: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20',
							].join(' ')}
						>
							<Truck className="h-4 w-4" />
							{dispatchLoading ? 'Deploiement en cours...' : 'Executer le deploiement'}
						</button>
					</form>
				</article>
			</section>
		</div>
	)
}
