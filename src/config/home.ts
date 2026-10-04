// Newsletter subscriptions are planned for a future release.
const titleLines = ["보안 소식,", "가볍게 읽고", "단단하게 지켜요."];
// Keep “보안 이야기” on its own line; narrower widths break the lead into
// a shorter opening phrase and a longer second phrase.
const descriptionLines = [["네 명의", "에디터가 고른"], ["보안 이야기"]];
const latestArticleLines = ["최신 보안", "소식 보러가기"];
export const home = {
  title: titleLines.join(" "),
  description: descriptionLines.flat().join(" "),
  latestArticleLabel: latestArticleLines.join(" "),
  titleLines,
  descriptionLines,
  latestArticleLines,
};
