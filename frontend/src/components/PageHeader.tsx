interface PageHeaderProps {
  title: string;
  compact?: boolean;
}

const PageHeader = ({ title, compact }: PageHeaderProps) => {
  // Intentionally empty: navigation/header is handled by the top navbar layout.
  // Keeping the component allows existing pages to avoid refactors.
  void title;
  void compact;
  return null;
};

export default PageHeader;
