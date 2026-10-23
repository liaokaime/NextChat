import { useNavigate } from "react-router-dom";
import { Path } from "../constant";
import Locale from "../locales";
import { List, ListItem } from "./ui-lib";
import { IconButton } from "./button";
import ConnectionIcon from "../icons/connection.svg";

export function ProviderSettings() {
  const navigate = useNavigate();
  return (
    <List>
      <ListItem
        title={Locale.ModelServices.Title}
        subTitle={Locale.ModelServices.Subtitle}
      >
        <IconButton
          icon={<ConnectionIcon />}
          text={Locale.ModelServices.Manage}
          onClick={() =>
            navigate(Path.ModelServices, { state: { returnTo: Path.Settings } })
          }
        />
      </ListItem>
    </List>
  );
}
