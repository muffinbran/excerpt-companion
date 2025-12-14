interface ScoreAreaProps {
  currentExcerpt: string;
}

export default function ScoreArea({ currentExcerpt }: ScoreAreaProps) {
  return (
    <div className="flex-1 p-8 overflow-auto bg-white/5 max-w-8xl">
      <div className="bg-white/80 rounded-lg h-full min-h-96 flex items-center justify-center text-gray-800">
        <div className="text-center">
          <div className="text-6xl mb-4">🎼</div>
          <h2 className="text-2xl font-bold mb-2">{currentExcerpt}</h2>
          <p className="text-gray-600">Score will be displayed here</p>
        </div>
      </div>
    </div>
  );
}
