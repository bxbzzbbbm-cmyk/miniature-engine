/**
 * Cloudflare Worker: US Phone Number Management
 * KV Namespace binding: NUMBERS_KV
 */

export const NUMBERS_KV = KV_NAMESPACE; // Replace KV_NAMESPACE with your actual KV binding name in wrangler config

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  try {
    if (pathname === '/search' && request.method === 'GET') {
      return await handleSearch(url);
    }
    if (pathname === '/api/buy' && request.method === 'POST') {
      return await handleBuy(request);
    }
    if (pathname === '/list-messages' && request.method === 'GET') {
      return await handleListMessages(url);
    }
    if (pathname === '/list-numbers' && request.method === 'GET') {
      return await handleListNumbers();
    }

    return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal Server Error', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// Search available numbers by area code (exclude numbers starting with 555)
async function handleSearch(url) {
  const areaCode = url.searchParams.get('area_code');
  if (!areaCode || !/^\d{3}$/.test(areaCode)) {
    return new Response(JSON.stringify({ error: 'Valid 3-digit area_code is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const key = `available:${areaCode}`;
  const numbersJson = await NUMBERS_KV.get(key);
  let numbers = numbersJson ? JSON.parse(numbersJson) : [];

  // Filter out numbers where the next 3 digits after area code start with '555'
  const filtered = numbers.filter(num => {
    const localPart = num.substring(3, 6);
    return localPart !== '555' && !num.startsWith('555');
  });

  return new Response(JSON.stringify({ area_code: areaCode, available_numbers: filtered }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Buy a number (remove from available, add to purchased)
async function handleBuy(request) {
  let data;
  try {
    data = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const number = data.number;
  if (!number || typeof number !== 'string') {
    return new Response(JSON.stringify({ error: 'Number is required and must be a string' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const areaCode = number.substring(0, 3);
  const availableKey = `available:${areaCode}`;
  const numbersJson = await NUMBERS_KV.get(availableKey);
  let numbers = numbersJson ? JSON.parse(numbersJson) : [];

  if (!numbers.includes(number)) {
    return new Response(JSON.stringify({ error: 'Number not available for purchase' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Remove number from available list
  numbers = numbers.filter(n => n !== number);
  await NUMBERS_KV.put(availableKey, JSON.stringify(numbers));

  // Add number to purchased list
  const purchaseData = {
    number,
    purchased_at: new Date().toISOString(),
    status: 'active'
  };
  await NUMBERS_KV.put(`purchased:${number}`, JSON.stringify(purchaseData));

  return new Response(JSON.stringify({ success: true, purchased_number: number }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' }
  });
}

// List messages for a purchased number
async function handleListMessages(url) {
  const number = url.searchParams.get('number');
  if (!number) {
    return new Response(JSON.stringify({ error: 'Number parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const messagesJson = await NUMBERS_KV.get(`messages:${number}`);
  const messages = messagesJson ? JSON.parse(messagesJson) : [];

  return new Response(JSON.stringify({ number, messages }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// List all purchased numbers
async function handleListNumbers() {
  const listResult = await NUMBERS_KV.list({ prefix: 'purchased:' });

  const purchasedNumbers = [];
  for (const key of listResult.keys) {
    const data = await NUMBERS_KV.get(key.name);
    if (data) {
      purchasedNumbers.push(JSON.parse(data));
    }
  }

  return new Response(JSON.stringify({
    count: purchasedNumbers.length,
    numbers: purchasedNumbers
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
