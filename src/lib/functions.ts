export const promptVal = ({
  selectedEmojis,
  selectedFeelings,
}: {
  selectedEmojis: any;
  selectedFeelings: string[];
}) => `You are a guided meditation script generator.  
Take a user’s feeling as input ${selectedEmojis} ${selectedFeelings}  
Generate a short, meaningful **guided meditation script lasting ~8 seconds**, split into **4 segments** (each ~2 seconds).  

Output format must be an array of 4 strings:  

[
  "Line 1 (~2s)", 
  "Line 2 (~2s)", 
  "Line 3 (~2s)", 
  "Line 4 (~2s)"
]

Each line should:  
- Use simple, calm, positive words.  
- Match the input feeling with soothing transformation (e.g., anxiety → calm, joy → deeper joy, tired → refreshed).  
- Work for **visual narration** (so visuals + audio sync well).`;
