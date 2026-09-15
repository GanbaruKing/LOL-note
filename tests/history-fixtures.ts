export function historyFixture(gameId = 12345) {
  const champions = [122, 64, 103, 51, 37, 266, 254, 39, 523, 117]
  const lanes = ['TOP', 'JUNGLE', 'MIDDLE', 'BOTTOM', 'BOTTOM']
  const roles = ['SOLO', 'NONE', 'SOLO', 'CARRY', 'SUPPORT']
  return {
    gameId,
    gameCreation: Date.UTC(2026, 8, 15, 5, 0),
    gameDuration: 1805,
    queueId: 420,
    gameMode: 'CLASSIC',
    mapId: 11,
    participantIdentities: champions.map((_, i) => ({
      participantId: i + 1,
      player: { puuid: i === 5 ? 'test-own' : `test-other-${i}`, summonerName: 'not-for-renderer' },
    })),
    participants: champions.map((championId, i) => ({
      participantId: i + 1,
      teamId: i < 5 ? 100 : 200,
      championId,
      spell1Id: 4,
      spell2Id: i % 5 === 1 ? 11 : 12,
      stats: { kills: 4, deaths: 2, assists: 7, win: i >= 5 },
      timeline: { lane: lanes[i % 5], role: roles[i % 5] },
    })),
  }
}
export function timelineFixture() {
  const positions = [
    { x: 1800, y: 11500 },
    { x: 6800, y: 4400 },
    { x: 7800, y: 7900 },
    { x: 13000, y: 2500 },
    { x: 12800, y: 2500 },
  ]
  return {
    frames: [180100, 240100, 300100, 360100, 420100].map((timestamp, sample) => ({
      timestamp,
      participantFrames: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [
          String(i + 1),
          {
            participantId: i + 1,
            position: positions[i % 5],
            minionsKilled: i % 5 === 4 ? sample + 2 : 20 + sample * 7,
          },
        ]),
      ),
    })),
  }
}
