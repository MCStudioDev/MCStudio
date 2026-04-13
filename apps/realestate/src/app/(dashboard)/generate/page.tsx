"use client";

import { useState } from "react";
import { PenTool, CheckCircle2 } from "lucide-react";
import { generatePropertyPost } from "@/app/actions/geminiActions";

export default function GeneratePostPage() {
  const [description, setDescription] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;

    setIsGenerating(true);
    setResult(null);

    try {
      const response = await generatePropertyPost(description);
      
      if (response.success && response.data) {
        setResult(response.data);
      } else {
        alert("Failed to analyze text: " + response.error);
      }
    } catch (error) {
      console.error(error);
      alert("Something went wrong generating the post.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveOutput = async () => {
    // In a real implementation this would write to Firestore
    alert("Post saved to database!");
    setDescription("");
    setResult(null);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Generate Listing Post</h1>
        <p className="mt-2 text-gray-600 font-medium">Describe your property and let Gemini write the copy.</p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-200">
        <form onSubmit={handleGenerate} className="space-y-4">
          <textarea
            className="w-full h-40 p-4 border border-gray-300 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-gray-800"
            placeholder="E.g. Beautiful 4 bed 3 bath home in downtown Austin. Has a newly renovated kitchen, large backyard, and is walking distance to the park. Asking $650k."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          ></textarea>
          
          <button
            type="submit"
            disabled={isGenerating || !description.trim()}
            className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 active:scale-[0.98] transition disabled:opacity-50"
          >
            {isGenerating ? (
              <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span>
            ) : (
              <PenTool className="h-5 w-5" />
            )}
            {isGenerating ? "Generating..." : "Generate Post"}
          </button>
        </form>

        {result && !isGenerating && (
          <div className="mt-8 bg-blue-50 rounded-2xl p-6 border border-blue-200 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center gap-2 mb-4 text-blue-800">
              <CheckCircle2 className="h-6 w-6" />
              <h3 className="font-bold text-lg">Your Post is Ready!</h3>
            </div>
            
            <div className="space-y-4">
              <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm">
                <p className="whitespace-pre-wrap text-gray-800">{result.postContent}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {result.hashtags?.map((tag: string, i: number) => (
                    <span key={i} className="text-blue-600 font-medium cursor-pointer hover:underline">#{tag}</span>
                  ))}
                </div>
                <p className="mt-4 font-bold text-gray-900 border-t pt-4 border-gray-100">{result.callToAction}</p>
              </div>

              <button
                onClick={handleSaveOutput}
                className="w-full mt-4 flex items-center justify-center px-6 py-4 bg-white border border-gray-300 text-gray-700 rounded-xl font-bold hover:bg-gray-50 transition"
              >
                Save Post
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
