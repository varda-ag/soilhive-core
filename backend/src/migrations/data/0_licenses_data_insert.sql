INSERT INTO licenses ("name",full_name,url) VALUES
	 ('CC BY 3.0','Attribution 3.0 Unported','https://creativecommons.org/licenses/by/3.0/'),
	 ('CC BY 4.0','Attribution 4.0 International','https://creativecommons.org/licenses/by/4.0/'),
	 ('CC BY-NC 3.0','Attribution-NonCommercial 3.0 Unported','https://creativecommons.org/licenses/by-nc/3.0/'),
	 ('CC BY-NC 4.0','Attribution-NonCommercial 4.0 International','https://creativecommons.org/licenses/by-nc/4.0/'),
	 ('CC BY-NC-SA 3.0 IGO','Attribution-NonCommercial-ShareAlike 3.0 IGO','https://creativecommons.org/licenses/by-nc-sa/3.0/igo/'),
	 ('CC BY-NC-SA-3.0','Attribution-NonCommercial-ShareAlike 3.0 Unported','https://creativecommons.org/licenses/by-nc-sa/3.0/'),
	 ('CC BY-SA 4.0','Attribution-ShareAlike 4.0 International','https://creativecommons.org/licenses/by-sa/4.0/'),
	 ('CC0 1.0','CC0 1.0 Universal','https://creativecommons.org/publicdomain/zero/1.0/'),
	 ('ODbL v1.0','Open Data Commons Open Database License v1.0','https://opendatacommons.org/licenses/odbl/1-0/'),
	 ('OGL-UK-3.0','Open Government Licence v3.0','https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/'),
	 ('US Public Domain','US Public Domain','https://www.idmanagement.gov/license/')
on conflict(name) do nothing;