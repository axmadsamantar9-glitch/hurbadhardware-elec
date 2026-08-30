import Image from "next/image";
import Link from "next/link";
import { localeField } from "@/lib/locale-field";
import { Card } from "@/components/ui/card";
import type { CategoryNode } from "@/lib/api/categories";

interface CategoryCardProps {
  category: CategoryNode;
  locale: string;
}

/** Category tile for the homepage's "shop by category" grid (U6/U8). */
export function CategoryCard({ category, locale }: CategoryCardProps) {
  const name = category[localeField(locale, "name")];

  return (
    <Link href={`/${locale}/category/${category.slug}`} className="group block">
      <Card className="flex h-full flex-col items-center gap-3 p-4 text-center transition-shadow group-hover:shadow-md">
        <div className="relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-muted">
          {category.imageUrl ? (
            <Image src={category.imageUrl} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <span aria-hidden="true" className="text-2xl font-semibold text-muted-foreground">
              {name.charAt(0)}
            </span>
          )}
        </div>
        <span className="text-sm font-medium text-foreground">{name}</span>
      </Card>
    </Link>
  );
}
