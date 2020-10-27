<script>
	import { onMount } from 'svelte'

	const DATE_TIME_OPTS = {
		month: 'numeric',
		year: 'numeric',
		day: 'numeric',
		hour: 'numeric', 
		minute: 'numeric',
		second: 'numeric',
		hour12: false
	}

	let messages = []
	let message = ''

	function ts (timestamp) {
	  const ts = new Date(timestamp)
	  return new Intl.DateTimeFormat('default', DATE_TIME_OPTS).format(ts)
	}

	function handleSendMsg () {
		return fetch('http://localhost:7000/messages', {
			method: 'post',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text: message })
		})
			.then((res) => {
				// reset input and fetch msgs from server
				message = ''
				return updateMessages()
			})
			.catch((e) => console.error(e))
	}

	async function updateMessages () {
		messages = await fetch('http://localhost:7000/messages')
			.then((res) => res.json())
			.then((data) => {
				const { messages: updatedMessages } = data
				updatedMessages.sort((a, b) => {
					const { content: ac } = a
					const { content: bc } = b
					const { timestamp: at } = ac
					const { timestamp: bt } = bc
					return at - bt
				})
				return updatedMessages.map(({ id, hash, content }) => {
					return {
						id,
						hash,
						content: {
							...content,
							timestamp: ts(content.timestamp),
						}
					}
				})
			})
	}

	onMount(() => {
		return updateMessages()
	})
</script>

<main>
	<div>
		{#if !messages.length}
			<span>No messages</span>
		{:else}
			{#each messages as { id, hash, content } (hash)}
				<div>
					<span class="time">{content.timestamp}</span>
					<span class="from" title={id}>{id.slice(0, 5)}: </span>
					<span class="content">{content.text}</span>
				</div>
			{/each}
		{/if}
	</div>
	<div>
		<form on:submit|preventDefault={handleSendMsg}>
			<input bind:value={message} placeholder="Type message here">
			<input type="submit" value="Send">
		</form>
	</div>
</main>

<style>
	main {
		font-family: monospace;
		padding: 1em;
		max-width: 240px;
		margin: 0 auto;
	}

	.time {
		color: gray;
	}

	.from {
		font-weight: bold;
	}

	@media (min-width: 640px) {
		main {
			max-width: none;
		}
	}
</style>
