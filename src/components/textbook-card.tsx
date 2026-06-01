"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Textbook {
  id: string;
  title: string;
  author: string;
  publisher: string;
  course: string | null;
  isRequired: boolean;
  availableCount: number;
  totalCount: number;
}

interface TextbookCardProps {
  textbook: Textbook;
  isSelected: boolean;
  price: number;
  rentalDays: number;
  onToggle: (id: string) => void;
}

export function TextbookCard({ textbook, isSelected, price, rentalDays, onToggle }: TextbookCardProps) {
  const canSelect = textbook.availableCount > 0;

  return (
    <Card
      className={`cursor-pointer transition-all ${isSelected ? "ring-2 ring-blue-500 bg-blue-50" : canSelect ? "hover:shadow-md" : "opacity-50"}`}
      onClick={() => canSelect && onToggle(textbook.id)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <CardTitle className="text-sm line-clamp-1">{textbook.title}</CardTitle>
          <div className="flex gap-1">
            {textbook.isRequired && <Badge className="shrink-0">必修</Badge>}
            {isSelected && <Badge className="bg-blue-500 shrink-0">已选</Badge>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="text-sm text-gray-600 space-y-1">
        <p>{textbook.author} · {textbook.publisher}</p>
        {textbook.course && <p>课程：{textbook.course}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className={`text-xs px-2 py-0.5 rounded ${textbook.availableCount > 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            库存 {textbook.availableCount}/{textbook.totalCount}
          </span>
          <span className="font-bold text-blue-600">¥{price}<span className="text-xs text-gray-400 font-normal">/{rentalDays}天</span></span>
        </div>
      </CardContent>
    </Card>
  );
}
