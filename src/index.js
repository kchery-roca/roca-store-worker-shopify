/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export default {
	async fetch(request, env, ctx) {

		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		}

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders })
		}

		const tokenResponse = await fetch(
			`https://${env.SHOPIFY_STORE_DOMAIN}/admin/oauth/access_token`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: new URLSearchParams({
					grant_type: 'client_credentials',
					client_id: env.SHOPIFY_CLIENT_ID,
					client_secret: env.SHOPIFY_CLIENT_SECRET,
				})
			}
		)

		if (!tokenResponse.ok) {
			const text = await tokenResponse.text()
			console.error('Token fetch failed:', tokenResponse.status, text)
			return new Response('Token fetch failed', { status: 500 })
		}

		const tokenData = await tokenResponse.json()
		console.log('Token response:', tokenData)

		const ordersResponse = await fetch(
			`https://${env.SHOPIFY_STORE_DOMAIN}/admin/api/2026-01/graphql.json`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Shopify-Access-Token': tokenData.access_token,
				},
				body: JSON.stringify({
					query: `{
						orders(first: 250, query: "variant_id:47906304917752") {
							edges {
								node {
									totalPriceSet {
										shopMoney { amount }
									}
									lineItems(first: 10) {
										edges {
											node {
												sku
												quantity
												variant {
													id
												}
											}
										}
									}
								}
							}
						}
					}`
				})
			}
		)
		
		const ordersData = await ordersResponse.json()
		const orders = ordersData.data.orders.edges

		let totalOrders = orders.length
		let totalRevenue = 0
		let totalSifters = 0

		const SIFTER_SKUS = ['A11200']
		
		orders.forEach(({ node: order }) => {
			totalRevenue += parseFloat(order.totalPriceSet.shopMoney.amount)
			
			order.lineItems.edges.forEach(({ node: item }) => {
				if (SIFTER_SKUS.includes(item.sku)) {
					totalSifters += item.quantity
				}
			})
		})
		
		const siftersPerOrder = totalOrders > 0 ? (totalSifters / totalOrders).toFixed(2) : '0'
		
		const stats = {
			totalOrders,
			totalRevenue: totalRevenue.toFixed(2),
			totalSifters,
			siftersPerOrder
		}
		
		console.log('Stats:', stats)
		
		return new Response(JSON.stringify(stats), {
			headers: { ...corsHeaders, 'Content-Type': 'application/json' }
		})
	},
};
