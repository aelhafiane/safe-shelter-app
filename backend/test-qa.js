;(async () => {
  const url = 'http://localhost:5000/api/reservations'
  const payload = {
    zoneId: 1,
    emplacementNumero: 905,
    cin: 'B331126',
  }

  async function sendReservation(label) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const rawBody = await response.text()
    let parsedBody

    try {
      parsedBody = JSON.parse(rawBody)
    } catch {
      parsedBody = rawBody
    }

    console.log(`${label} status:`, response.status)
    console.log(`${label} body:`, parsedBody)
    console.log('------------------------------')
  }

  try {
    // Back-to-back calls to test duplicate reservation handling.
    await sendReservation('Request #1')
    await sendReservation('Request #2')
  } catch (error) {
    console.error('QA test failed:', error)
    process.exitCode = 1
  }
})()
