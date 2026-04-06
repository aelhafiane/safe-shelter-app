import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Edit2, Plus, Trash2, X } from 'lucide-react'

const STOCKS_API_URL = 'http://localhost:5000/api/stocks'
const ZONES_API_URL = 'http://localhost:5000/api/zones'

export default function StocksPage() {
	const [stocks, setStocks] = useState([])
	const [zones, setZones] = useState([])
	const [isModalOpen, setIsModalOpen] = useState(false)
	const [editingStock, setEditingStock] = useState(null)
	const [type_ressource, setTypeRessource] = useState('eau')
	const [quantite_disponible, setQuantiteDisponible] = useState('')
	const [seuil_alerte, setSeuilAlerte] = useState('')
	const [submitting, setSubmitting] = useState(false)

	useEffect(() => {
		let isMounted = true

		const fetchStocksAndZones = async () => {
			try {
				const [stocksResponse, zonesResponse] = await Promise.all([
					axios.get(STOCKS_API_URL),
					axios.get(ZONES_API_URL),
				])

				if (!isMounted) {
					return
				}

				const stocksPayload = Array.isArray(stocksResponse?.data)
					? stocksResponse.data
					: stocksResponse?.data?.data
				const zonesPayload = Array.isArray(zonesResponse?.data)
					? zonesResponse.data
					: zonesResponse?.data?.data

				setStocks(Array.isArray(stocksPayload) ? stocksPayload : [])
				setZones(Array.isArray(zonesPayload) ? zonesPayload : [])
			} catch (error) {
				console.error('Failed to fetch stocks/zones:', error)
			}
		}

		fetchStocksAndZones()

		return () => {
			isMounted = false
		}
	}, [])

	const zonesById = useMemo(() => {
		const map = new Map()

		zones.forEach((zone) => {
			const id = zone?.zone_id ?? zone?.id_zone ?? zone?.id
			if (id !== undefined && id !== null) {
				map.set(String(id), zone?.nom ?? `Zone #${id}`)
			}
		})

		return map
	}, [zones])

	const centralHub = useMemo(() => {
		return (
			zones.find((zone) => {
				const hubFlag = zone?.is_hub

				return (
					hubFlag === true ||
					hubFlag === 1 ||
					hubFlag === '1' ||
					hubFlag === 'true' ||
					hubFlag === 't'
				)
			}) ?? null
		)
	}, [zones])

	const resetForm = () => {
		setEditingStock(null)
		setTypeRessource('eau')
		setQuantiteDisponible('')
		setSeuilAlerte('')
	}

	const closeModal = () => {
		setIsModalOpen(false)
		resetForm()
	}

	const openCreateModal = () => {
		resetForm()
		setIsModalOpen(true)
	}

	const openEditModal = (stock) => {
		setEditingStock(stock)
		setTypeRessource(stock?.type_ressource ?? 'eau')
		setQuantiteDisponible(String(stock?.quantite_disponible ?? ''))
		setSeuilAlerte(String(stock?.seuil_alerte ?? ''))
		setIsModalOpen(true)
	}

	const buildPayload = () => {
		if (
			!type_ressource ||
			quantite_disponible === '' ||
			seuil_alerte === '' ||
			!centralHub?.zone_id
		) {
			return null
		}

		return {
			zone_id: Number(centralHub.zone_id),
			type_ressource,
			quantite_disponible: Number(quantite_disponible),
			seuil_alerte: Number(seuil_alerte),
		}
	}

	const handleCreate = async () => {
		const payload = buildPayload()
		if (!payload) {
			return
		}

		setSubmitting(true)

		try {
			const response = await axios.post(STOCKS_API_URL, payload)
			const createdStock = response?.data?.data ?? response?.data

			if (createdStock && typeof createdStock === 'object') {
				setStocks((prevStocks) => [createdStock, ...prevStocks])
			} else {
				setStocks((prevStocks) => [
					{
						stock_id: Date.now(),
						zone_nom: zonesById.get(String(payload.zone_id)) ?? `Zone #${payload.zone_id}`,
						...payload,
					},
					...prevStocks,
				])
			}

			closeModal()
		} catch (error) {
			console.error('Failed to create stock:', error)
		} finally {
			setSubmitting(false)
		}
	}

	const handleUpdate = async () => {
		if (!editingStock) {
			return
		}

		const stockId = editingStock?.stock_id ?? editingStock?.id
		if (!stockId) {
			return
		}

		const payload = buildPayload()
		if (!payload) {
			return
		}

		setSubmitting(true)

		try {
			const response = await axios.put(`${STOCKS_API_URL}/${stockId}`, payload)
			const updatedStock = response?.data?.data ?? response?.data ?? payload

			setStocks((prevStocks) =>
				prevStocks.map((stock) => {
					const currentId = stock?.stock_id ?? stock?.id
					return currentId === stockId
						? {
								...stock,
								...updatedStock,
								zone_nom:
									updatedStock?.zone_nom ??
									zonesById.get(String(payload.zone_id)) ??
									stock?.zone_nom,
							}
						: stock
				})
			)

			closeModal()
		} catch (error) {
			console.error('Failed to update stock:', error)
		} finally {
			setSubmitting(false)
		}
	}

	const handleDelete = async (stock) => {
		const stockId = stock?.stock_id ?? stock?.id
		if (!stockId) {
			return
		}

		try {
			await axios.delete(`${STOCKS_API_URL}/${stockId}`)
			setStocks((prevStocks) =>
				prevStocks.filter((item) => {
					const currentId = item?.stock_id ?? item?.id
					return currentId !== stockId
				})
			)
		} catch (error) {
			console.error('Failed to delete stock:', error)
		}
	}

	const modalTitle = useMemo(
		() => (editingStock ? 'Modifier le Stock' : 'Ajouter un Stock'),
		[editingStock]
	)

	const handleSubmit = async (event) => {
		event.preventDefault()

		if (editingStock) {
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
						<p className="text-xs uppercase tracking-[0.24em] text-cyan-300/80">Logistics Grid</p>
						<h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">
							Gestion des Stocks
						</h1>
						<p className="mt-2 text-sm text-slate-400">
							Pilotage des ressources critiques et surveillance des seuils d'alerte.
						</p>
					</div>

					<button
						type="button"
						onClick={openCreateModal}
						className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_14px_34px_rgba(6,182,212,0.34)]"
					>
						<Plus className="h-4 w-4" />
						Ajouter un Stock
					</button>
				</div>

				<div className="flex-1 overflow-hidden bg-slate-950/60 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_0_40px_rgba(0,0,0,0.5)]">
					<div className="h-full overflow-auto">
						<table className="min-w-full text-left text-sm">
							<thead className="sticky top-0 z-10 bg-slate-900/65 text-xs uppercase tracking-[0.2em] text-slate-300 backdrop-blur-xl">
								<tr>
									<th className="px-6 py-4">Zone</th>
									<th className="px-6 py-4">Type de Ressource</th>
									<th className="px-6 py-4">Quantité Disponible</th>
									<th className="px-6 py-4">Seuil d'Alerte</th>
									<th className="px-6 py-4">Statut</th>
									<th className="px-6 py-4 text-right">Actions</th>
								</tr>
							</thead>
							<tbody>
								{stocks.length === 0 && (
									<tr>
										<td colSpan={6} className="px-6 py-20 text-center text-slate-400">
											Aucun stock disponible pour le moment.
										</td>
									</tr>
								)}

								{stocks.map((stock) => {
									const stockId = stock?.stock_id ?? stock?.id ?? '-'
									const quantity = Number(stock?.quantite_disponible) || 0
									const threshold = Number(stock?.seuil_alerte) || 0
									const isCritical = quantity <= threshold
									const zoneName =
										stock?.zone_nom ??
										zonesById.get(String(stock?.zone_id ?? '')) ??
										`Zone #${stock?.zone_id ?? '-'}`

									return (
										<tr
											key={stockId}
											className="border-t border-white/10 transition-colors hover:bg-slate-900/50"
										>
											<td className="px-6 py-4 font-medium text-slate-100">{zoneName}</td>
											<td className="px-6 py-4 text-slate-300">{stock?.type_ressource}</td>
											<td className="px-6 py-4 text-slate-300">{quantity}</td>
											<td className="px-6 py-4 text-slate-300">{threshold}</td>
											<td className="px-6 py-4">
												<span
													className={[
														'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider',
														isCritical
															? 'bg-rose-500/20 text-rose-300 border-rose-500/50 animate-pulse'
															: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300',
													].join(' ')}
												>
													{isCritical ? 'CRITIQUE' : 'NORMAL'}
												</span>
											</td>
											<td className="px-6 py-4">
												<div className="flex justify-end gap-2">
													<button
														type="button"
														onClick={() => openEditModal(stock)}
														className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-slate-300 transition-all duration-200 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-200"
														title="Modifier"
													>
														<Edit2 className="h-4 w-4" />
													</button>

													<button
														type="button"
														onClick={() => handleDelete(stock)}
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
					<div className="w-full max-w-3xl rounded-3xl border border-white/10 bg-slate-950/65 p-6 shadow-[0_0_45px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
						<div className="mb-6 flex items-center justify-between gap-4">
							<div>
								<p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Stock Console</p>
								<h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-100">
									{modalTitle}
								</h2>
								<p className="mt-1 text-sm text-slate-400">
									Configurez les ressources avec précision opérationnelle.
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

						<form className="space-y-4" onSubmit={handleSubmit}>
							<div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
								Hub cible automatique:{' '}
								<span className="font-semibold">
									{centralHub?.nom ?? 'Aucun hub detecte (is_hub = true requis)'}
								</span>
							</div>

							<div className="grid gap-4 md:grid-cols-2">
								<div>
									<label
										htmlFor="stock_type"
										className="mb-2 block text-xs uppercase tracking-widest text-slate-400"
									>
										Type de Ressource
									</label>
									<select
										id="stock_type"
										required
										value={type_ressource}
										onChange={(event) => setTypeRessource(event.target.value)}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
									>
										<option value="eau">Eau</option>

										<option value="tente">Tente</option>

										<option value="kit_medical">Kit Médical</option>
									</select>
								</div>

								<div>
									<label
										htmlFor="stock_quantity"
										className="mb-2 block text-xs uppercase tracking-widest text-slate-400"
									>
										Quantité Disponible
									</label>
									<input
										id="stock_quantity"
										type="number"
										min="0"
										required
										value={quantite_disponible}
										onChange={(event) => setQuantiteDisponible(event.target.value)}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
										placeholder="Ex: 500"
									/>
								</div>

								<div>
									<label
										htmlFor="stock_threshold"
										className="mb-2 block text-xs uppercase tracking-widest text-slate-400"
									>
										Seuil d'Alerte
									</label>
									<input
										id="stock_threshold"
										type="number"
										min="0"
										required
										value={seuil_alerte}
										onChange={(event) => setSeuilAlerte(event.target.value)}
										className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50"
										placeholder="Ex: 120"
									/>
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
									disabled={submitting || !centralHub?.zone_id}
									className="rounded-xl border border-cyan-400/30 bg-gradient-to-r from-cyan-600 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(37,99,235,0.28)] transition-all duration-200 hover:scale-[1.01] hover:shadow-[0_14px_34px_rgba(6,182,212,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
								>
									{submitting
										? 'Traitement...'
										: editingStock
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
